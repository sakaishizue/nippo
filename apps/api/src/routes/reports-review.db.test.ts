import { paginatedSchema, pendingReportSchema, reportDetailSchema } from "@nippo/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの日報: U1 の R-app(承認済み)、R-ret(差し戻し)、R-sub(提出済み、11月4日 18:00)、R-draft(下書き)。U3 の R-u3(提出済み)
const NOW = "2026-11-05T19:00:00+09:00";

beforeEach(() => setNow(new Date(NOW)));
afterEach(() => setNow(null));

type Role = keyof TestData["users"];

const setup = async (role: Role = "M1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  const approve = (reportId: number) =>
    client.request(`/api/v1/reports/${reportId}/approve`, { method: "POST" });
  const sendBack = (reportId: number, reason: unknown = "訪問内容をもう少し具体的に") =>
    client.request(`/api/v1/reports/${reportId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  return { ...data, client, approve, sendBack };
};

const errorCodeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe("POST /reports/{id}/approve", () => {
  test("REV-01: M1 が R-sub を承認すると、承認済みになり、承認履歴が1件増え、U1 に通知する", async () => {
    const { approve, reports, users } = await setup();
    const res = await approve(reports["R-sub"].id);
    expect(res.status).toBe(200);
    const body = reportDetailSchema.parse(await res.json());
    expect(body.status).toBe("approved");
    expect(body.reviews).toEqual([
      {
        id: expect.any(Number),
        reviewer: { id: users.M1.id, name: "鈴木 一郎" },
        action: "approved",
        reason: null,
        created_at: NOW,
      },
    ]);
    expect(body.permissions.can_review).toBe(false);
    expect(await testDb.notification.findMany()).toMatchObject([
      {
        userId: users.U1.id,
        reportId: reports["R-sub"].id,
        type: "approved",
        message: "11月4日の日報が承認されました",
      },
    ]);
  });

  test("REV-05: 部下以外の日報(M2 が R-sub)は 404", async () => {
    const { approve, reports } = await setup("M2");
    expect((await approve(reports["R-sub"].id)).status).toBe(404);
  });

  test("REV-06: 下書き(M1 が R-draft)は、上長が閲覧できないため 404", async () => {
    const { approve, reports } = await setup();
    expect((await approve(reports["R-draft"].id)).status).toBe(404);
  });

  test("REV-07: 承認済みの R-app を承認すると 409 INVALID_STATUS。履歴も通知も増えない", async () => {
    const { approve, reports } = await setup();
    const res = await approve(reports["R-app"].id);
    expect(res.status).toBe(409);
    expect(await errorCodeOf(res)).toBe("INVALID_STATUS");
    expect(await testDb.reportReview.count({ where: { reportId: reports["R-app"].id } })).toBe(1);
    expect(await testDb.notification.count()).toBe(0);
  });

  test.each([
    ["REV-09", "U1"],
    ["REV-10", "A1"],
  ] as const)("%s: %s は 403", async (_id, role) => {
    const { approve, reports } = await setup(role);
    expect((await approve(reports["R-sub"].id)).status).toBe(403);
  });

  test("存在しない日報は 404", async () => {
    const { approve } = await setup();
    expect((await approve(999_999)).status).toBe(404);
  });
});

describe("POST /reports/{id}/return", () => {
  test("REV-02: M1 が R-sub を差し戻すと、差し戻しになり、履歴に理由が残り、U1 に通知する", async () => {
    const { sendBack, reports, users } = await setup();
    const res = await sendBack(reports["R-sub"].id, "  見積の金額を書いてください  ");
    expect(res.status).toBe(200);
    const body = reportDetailSchema.parse(await res.json());
    expect(body.status).toBe("returned");
    // 前後の空白は除く
    expect(body.reviews.map((r) => [r.action, r.reason])).toEqual([
      ["returned", "見積の金額を書いてください"],
    ]);
    expect(await testDb.notification.findMany()).toMatchObject([
      {
        userId: users.U1.id,
        type: "returned",
        message: "11月4日の日報が差し戻されました",
      },
    ]);
  });

  test.each([[""], ["   "], [null]])("REV-03: 理由が %j なら 422。差し戻さない", async (reason) => {
    const { sendBack, reports } = await setup();
    const res = await sendBack(reports["R-sub"].id, reason);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.map((d) => d.field)).toEqual(["reason"]);
    expect(
      (await testDb.dailyReport.findUniqueOrThrow({ where: { id: reports["R-sub"].id } })).status,
    ).toBe("submitted");
  });

  test("REV-04: 理由は1,000文字までは 200、1,001文字は 422", async () => {
    const { sendBack, reports } = await setup();
    expect((await sendBack(reports["R-sub"].id, "あ".repeat(1001))).status).toBe(422);
    expect((await sendBack(reports["R-sub"].id, "あ".repeat(1000))).status).toBe(200);
  });

  test("REV-08: 差し戻した後に、同じ画面から承認すると 409 INVALID_STATUS", async () => {
    const { sendBack, approve, reports } = await setup();
    expect((await sendBack(reports["R-sub"].id)).status).toBe(200);
    const res = await approve(reports["R-sub"].id);
    expect(res.status).toBe(409);
    expect(await errorCodeOf(res)).toBe("INVALID_STATUS");
  });

  test("承認と差し戻しを同時に行っても、どちらか一方だけが成功する", async () => {
    const { sendBack, approve, reports } = await setup();
    const results = await Promise.all([
      approve(reports["R-sub"].id),
      sendBack(reports["R-sub"].id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await testDb.reportReview.count({ where: { reportId: reports["R-sub"].id } })).toBe(1);
    expect(await testDb.notification.count()).toBe(1);
  });

  test("一般は 403", async () => {
    const { sendBack, reports } = await setup("U1");
    expect((await sendBack(reports["R-sub"].id)).status).toBe(403);
  });
});

test("REV-11: 差し戻し、再提出、承認の順に実行すると、reviews に2件が古い順に並ぶ", async () => {
  const { sendBack, approve, reports, users } = await setup();
  const id = reports["R-sub"].id;
  expect((await sendBack(id, "見積の金額を書いてください")).status).toBe(200);

  setNow(new Date("2026-11-06T09:00:00+09:00"));
  const member = await loginAs(createTestApp(), users.U1);
  expect((await member.request(`/api/v1/reports/${id}/submit`, { method: "POST" })).status).toBe(
    200,
  );

  setNow(new Date("2026-11-06T10:00:00+09:00"));
  const res = await approve(id);
  expect(res.status).toBe(200);
  const body = reportDetailSchema.parse(await res.json());
  expect(body.reviews.map((r) => [r.action, r.reason, r.created_at])).toEqual([
    ["returned", "見積の金額を書いてください", NOW],
    ["approved", null, "2026-11-06T10:00:00+09:00"],
  ]);
});

const pendingSchema = paginatedSchema(pendingReportSchema);

describe("GET /reports/pending", () => {
  test("VIEW-12: M1 は部下の提出済みの日報だけを、提出日時の古い順に返す", async () => {
    const { client, reports, users } = await setup();
    // U2 の提出済み(R-sub より前に提出)と、U2 の下書きを足す
    const early = await testDb.dailyReport.create({
      data: {
        userId: users.U2.id,
        reportDate: new Date("2026-11-03T00:00:00Z"),
        status: "submitted",
        submittedAt: new Date("2026-11-03T18:00:00+09:00"),
        workEntries: { create: [{ category: "travel", minutes: 30 }] },
      },
    });
    await testDb.dailyReport.create({
      data: { userId: users.U2.id, reportDate: new Date("2026-11-05T00:00:00Z"), status: "draft" },
    });

    const res = await client.request("/api/v1/reports/pending");
    expect(res.status).toBe(200);
    const body = pendingSchema.parse(await res.json());
    expect(body.pagination).toEqual({ page: 1, per_page: 20, total: 2 });
    expect(body.items).toEqual([
      {
        id: early.id,
        report_date: "2026-11-03",
        user: { id: users.U2.id, name: "佐藤 花子" },
        submitted_at: "2026-11-03T18:00:00+09:00",
        // 11月5日 19:00 の時点で49時間
        is_overdue: true,
        visit_count: 0,
        total_minutes: 30,
      },
      {
        id: reports["R-sub"].id,
        report_date: "2026-11-04",
        user: { id: users.U1.id, name: "山田 太郎" },
        submitted_at: "2026-11-04T18:00:00+09:00",
        is_overdue: false,
        visit_count: 1,
        total_minutes: 90,
      },
    ]);
  });

  test.each([
    ["2026-11-06T17:59:00+09:00", false],
    ["2026-11-06T18:00:00+09:00", true],
  ])("VIEW-13: R-sub(11月4日 18:00 提出)は、%s の時点で is_overdue が %s", async (at, overdue) => {
    const { client } = await setup();
    setNow(new Date(at));
    const body = pendingSchema.parse(
      await (await client.request("/api/v1/reports/pending")).json(),
    );
    expect(body.items.map((r) => r.is_overdue)).toEqual([overdue]);
  });

  test("M2 には自分の部下(U3)の日報だけ", async () => {
    const { client, reports } = await setup("M2");
    const body = pendingSchema.parse(
      await (await client.request("/api/v1/reports/pending")).json(),
    );
    expect(body.items.map((r) => r.id)).toEqual([reports["R-u3"].id]);
  });

  test.each(["U1", "A1"] as const)("%s は 403", async (role) => {
    const { client } = await setup(role);
    expect((await client.request("/api/v1/reports/pending")).status).toBe(403);
  });
});
