import { reportCommentSchema, reportDetailSchema } from "@nippo/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの日報: U1 の R-sub(提出済み、11月4日)、R-draft(下書き、11月5日)。U1、U2 の上長は M1、U3 の上長は M2
const NOW = "2026-11-05T20:00:00+09:00";

beforeEach(() => setNow(new Date(NOW)));
afterEach(() => setNow(null));

type Role = keyof TestData["users"];

const setup = async (role: Role) => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  const comment = (reportId: number, body: unknown = "提案の反応を詳しく教えてください") =>
    client.request(`/api/v1/reports/${reportId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  const notifications = () =>
    testDb.notification.findMany({ select: { userId: true, type: true, message: true } });
  return { ...data, client, comment, notifications };
};

describe("POST /reports/{id}/comments", () => {
  test("CMT-01: U1 が R-sub にコメントすると 201。M1 に通知し、U1 には通知しない", async () => {
    const { comment, notifications, reports, users } = await setup("U1");
    const res = await comment(reports["R-sub"].id);
    expect(res.status).toBe(201);
    expect(reportCommentSchema.parse(await res.json())).toEqual({
      id: expect.any(Number),
      user: { id: users.U1.id, name: "山田 太郎" },
      body: "提案の反応を詳しく教えてください",
      created_at: NOW,
    });
    expect(await notifications()).toEqual([
      {
        userId: users.M1.id,
        type: "commented",
        message: "11月4日の日報に山田さんがコメントしました",
      },
    ]);
  });

  test("CMT-02: M1 が R-sub にコメントすると 201。U1 に通知し、M1 には通知しない", async () => {
    const { comment, notifications, reports, users } = await setup("M1");
    expect((await comment(reports["R-sub"].id)).status).toBe(201);
    expect(await notifications()).toEqual([
      {
        userId: users.U1.id,
        type: "commented",
        message: "11月4日の日報に鈴木さんがコメントしました",
      },
    ]);
  });

  test("CMT-03: U1 が下書きの R-draft にコメントすると 201。上長は閲覧できないため M1 に通知しない", async () => {
    const { comment, notifications, reports } = await setup("U1");
    expect((await comment(reports["R-draft"].id)).status).toBe(201);
    expect(await notifications()).toEqual([]);
  });

  test("CMT-04: 他の一般(U2)が R-sub にコメントすると 404", async () => {
    const { comment, reports } = await setup("U2");
    expect((await comment(reports["R-sub"].id)).status).toBe(404);
    expect(await testDb.reportComment.count()).toBe(0);
  });

  test("CMT-05: 部下以外の上長(M2)が R-sub にコメントすると 404", async () => {
    const { comment, reports } = await setup("M2");
    expect((await comment(reports["R-sub"].id)).status).toBe(404);
  });

  test("上長は部下の下書きにコメントできない(閲覧できないため 404)", async () => {
    const { comment, reports } = await setup("M1");
    expect((await comment(reports["R-draft"].id)).status).toBe(404);
  });

  test("CMT-06: 管理者(A1)は 403", async () => {
    const { comment, reports } = await setup("A1");
    expect((await comment(reports["R-sub"].id)).status).toBe(403);
  });

  test.each([[""], ["   "], ["あ".repeat(1001)], [null]])(
    "CMT-07: 本文が %j なら 422",
    async (body) => {
      const { comment, reports } = await setup("U1");
      const res = await comment(reports["R-sub"].id, body);
      expect(res.status).toBe(422);
      const error = (await res.json()) as { error: { details: { field: string }[] } };
      expect(error.error.details.map((d) => d.field)).toEqual(["body"]);
      expect(await testDb.reportComment.count()).toBe(0);
    },
  );

  test("本文は1,000文字まで投稿でき、前後の空白は除く", async () => {
    const { comment, reports } = await setup("U1");
    expect((await comment(reports["R-sub"].id, "あ".repeat(1000))).status).toBe(201);
    const res = await comment(reports["R-sub"].id, "  よろしくお願いします  ");
    expect(reportCommentSchema.parse(await res.json()).body).toBe("よろしくお願いします");
  });

  test("投稿したコメントは、日報詳細の comments に古い順に並ぶ", async () => {
    const { client, comment, reports } = await setup("U1");
    await comment(reports["R-sub"].id, "1件目");
    setNow(new Date("2026-11-05T20:05:00+09:00"));
    await comment(reports["R-sub"].id, "2件目");
    const detail = reportDetailSchema.parse(
      await (await client.request(`/api/v1/reports/${reports["R-sub"].id}`)).json(),
    );
    expect(detail.comments.map((c) => c.body)).toEqual(["1件目", "2件目"]);
  });
});
