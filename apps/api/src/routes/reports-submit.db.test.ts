import { reportDetailSchema } from "@nippo/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

const NOW = "2026-11-05T19:00:00+09:00";

beforeEach(() => setNow(new Date(NOW)));
afterEach(() => setNow(null));

type Role = keyof TestData["users"];

const setup = async (role: Role = "U1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  const submit = (reportId: number) =>
    client.request(`/api/v1/reports/${reportId}/submit`, { method: "POST" });
  /** R-draft に所感と翌日の予定を入れて、提出できる状態にする(訪問内容は入力済み) */
  const completeDraft = () =>
    testDb.dailyReport.update({
      where: { id: data.reports["R-draft"].id },
      data: { reflection: "見積書の反応を確認できた", nextPlan: "見積の修正" },
    });
  return { ...data, client, submit, completeDraft };
};

const errorOf = async (res: Response) =>
  (await res.json()).error as { code: string; details?: { field: string; message: string }[] };

describe("POST /reports/{id}/submit", () => {
  test("SUB-01: 入力がそろった R-draft を提出すると、提出済みになり、M1 に通知する", async () => {
    const { submit, completeDraft, reports, users } = await setup();
    await completeDraft();
    const res = await submit(reports["R-draft"].id);
    expect(res.status).toBe(200);
    expect(reportDetailSchema.parse(await res.json())).toMatchObject({
      status: "submitted",
      submitted_at: "2026-11-05T19:00:00+09:00",
      permissions: { can_edit: false },
    });
    expect(await testDb.notification.findMany()).toMatchObject([
      {
        userId: users.M1.id,
        reportId: reports["R-draft"].id,
        type: "submitted",
        message: "山田さんが11月5日の日報を提出しました",
        readAt: null,
      },
    ]);
  });

  test("SUB-02: 作業が0件の下書きは 422", async () => {
    const { submit, users } = await setup();
    const empty = await testDb.dailyReport.create({
      data: {
        userId: users.U1.id,
        reportDate: new Date("2026-11-06T00:00:00Z"),
        reflection: "所感",
        nextPlan: "予定",
      },
    });
    const res = await submit(empty.id);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual(["work_entries"]);
  });

  test("SUB-03: 訪問内容が空なら 422", async () => {
    const { submit, completeDraft, reports } = await setup();
    await completeDraft();
    await testDb.visit.updateMany({
      where: { workEntry: { reportId: reports["R-draft"].id } },
      data: { content: null },
    });
    const res = await submit(reports["R-draft"].id);
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatchObject({
      details: [{ field: "work_entries[0].visit.content", message: "訪問内容を入力してください" }],
    });
  });

  test.each([
    ["SUB-04: 所感が空", { reflection: null }, "reflection"],
    ["SUB-05: 翌日の予定が空", { nextPlan: "  " }, "next_plan"],
  ])("%s なら 422", async (_name, data, field) => {
    const { submit, completeDraft, reports } = await setup();
    await completeDraft();
    await testDb.dailyReport.update({ where: { id: reports["R-draft"].id }, data });
    const res = await submit(reports["R-draft"].id);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual([field]);
  });

  test("提出できなければ、ステータスは変わらず通知も作らない", async () => {
    const { submit, reports } = await setup();
    // R-draft は所感と翌日の予定が空
    expect((await submit(reports["R-draft"].id)).status).toBe(422);
    const report = await testDb.dailyReport.findUniqueOrThrow({
      where: { id: reports["R-draft"].id },
    });
    expect(report.status).toBe("draft");
    expect(await testDb.notification.count()).toBe(0);
  });

  test("SUB-06: 差し戻し(R-ret)を再提出すると、提出済みになり submitted_at が更新される", async () => {
    const { submit, reports } = await setup();
    const res = await submit(reports["R-ret"].id);
    expect(res.status).toBe(200);
    const body = reportDetailSchema.parse(await res.json());
    expect(body).toMatchObject({ status: "submitted", submitted_at: "2026-11-05T19:00:00+09:00" });
    // 差し戻しの履歴は残る
    expect(body.reviews).toMatchObject([{ action: "returned" }]);
    expect(await testDb.notification.count({ where: { type: "submitted" } })).toBe(1);
  });

  test.each([
    ["SUB-07: 提出済み(R-sub)", "R-sub"],
    ["SUB-08: 承認済み(R-app)", "R-app"],
  ] as const)("%s の提出は 409 INVALID_STATUS", async (_name, report) => {
    const { submit, reports } = await setup();
    const res = await submit(reports[report].id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("INVALID_STATUS");
  });

  test("SUB-09: 他の一般(U2)が R-draft を提出すると 404", async () => {
    const { reports, completeDraft, users } = await setup();
    await completeDraft();
    const u2 = await loginAs(createTestApp(), users.U2);
    const res = await u2.request(`/api/v1/reports/${reports["R-draft"].id}/submit`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  test("上長(M1)は提出できない(403)", async () => {
    const { reports, submit } = await setup("M1");
    const res = await submit(reports["R-ret"].id);
    expect(res.status).toBe(403);
  });
});
