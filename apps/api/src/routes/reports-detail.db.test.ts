import { reportDetailSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

type Role = keyof TestData["users"];

const setup = async () => {
  const data = await seedTestData(testDb);
  const as = (role: Role) => loginAs(createTestApp(), data.users[role]);
  const get = async (role: Role, report: keyof TestData["reports"]) =>
    (await as(role)).request(`/api/v1/reports/${data.reports[report].id}`);
  return { ...data, as, get };
};

describe("GET /reports/{id} の閲覧範囲", () => {
  test("一般は自分の日報を、下書きも含めて見られる", async () => {
    const { get } = await setup();
    for (const report of ["R-draft", "R-sub", "R-ret", "R-app"] as const) {
      expect((await get("U1", report)).status, report).toBe(200);
    }
  });

  test("VIEW-05: 他の一般(U2)は R-sub を見られない(404)", async () => {
    const { get } = await setup();
    const res = await get("U2", "R-sub");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("VIEW-06: 上長(M1)は部下の下書き(R-draft)を見られない(404)", async () => {
    const { get } = await setup();
    expect((await get("M1", "R-draft")).status).toBe(404);
  });

  test("上長(M1)は部下の提出済み、差し戻し、承認済みを見られる", async () => {
    const { get } = await setup();
    for (const report of ["R-sub", "R-ret", "R-app"] as const) {
      expect((await get("M1", report)).status, report).toBe(200);
    }
  });

  test("部下以外の上長(M2)は R-sub を見られず、自分の部下(U3)の日報は見られる", async () => {
    const { get } = await setup();
    expect((await get("M2", "R-sub")).status).toBe(404);
    expect((await get("M2", "R-u3")).status).toBe(200);
  });

  test("管理者(A1)は全員の提出済み以降を見られ、下書きは見られない", async () => {
    const { get } = await setup();
    expect((await get("A1", "R-sub")).status).toBe(200);
    expect((await get("A1", "R-u3")).status).toBe(200);
    expect((await get("A1", "R-draft")).status).toBe(404);
  });

  test("存在しない日報は 404。ID が数字でなければ、未定義の URL として 404", async () => {
    const { as } = await setup();
    const client = await as("U1");
    expect((await client.request("/api/v1/reports/999999")).status).toBe(404);
    expect((await client.request("/api/v1/reports/abc")).status).toBe(404);
  });

  test("ログインしていなければ 401", async () => {
    const { reports } = await setup();
    const res = await createTestApp().request(`/api/v1/reports/${reports["R-sub"].id}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /reports/{id} の内容", () => {
  test("作業(商談、訪問の詳細)、合計時間、承認履歴を返す", async () => {
    const { get, reports, users, deals, customers } = await setup();
    const res = await get("U1", "R-app");
    const body = reportDetailSchema.parse(await res.json());
    expect(body).toMatchObject({
      id: reports["R-app"].id,
      report_date: "2026-11-02",
      user: { id: users.U1.id, name: "山田 太郎" },
      status: "approved",
      reflection: "提案資料の反応がよかった",
      next_plan: "見積の準備",
      submitted_at: "2026-11-02T18:00:00+09:00",
      total_minutes: 150,
      comments: [],
    });
    expect(body.work_entries).toEqual([
      {
        id: expect.any(Number),
        category: "visit",
        minutes: 90,
        deal: { id: deals.D1.id, name: "新サービス導入" },
        note: null,
        visit: {
          id: expect.any(Number),
          customer: { id: customers.C1.id, name: "A株式会社" },
          contact_name: "田中部長",
          content: "新サービスの提案",
          next_action: "来週までに見積を提示",
        },
      },
      {
        id: expect.any(Number),
        category: "travel",
        minutes: 60,
        deal: null,
        note: null,
        visit: null,
      },
    ]);
    expect(body.reviews).toEqual([
      {
        id: expect.any(Number),
        reviewer: { id: users.M1.id, name: "鈴木 一郎" },
        action: "approved",
        reason: null,
        created_at: "2026-11-02T19:00:00+09:00",
      },
    ]);
  });

  test("差し戻しの理由と、一度も提出していない日報の submitted_at(null)を返す", async () => {
    const { get } = await setup();
    const returned = reportDetailSchema.parse(await (await get("U1", "R-ret")).json());
    expect(returned.reviews).toMatchObject([
      { action: "returned", reason: "訪問内容をもう少し具体的に" },
    ]);
    const draft = reportDetailSchema.parse(await (await get("U1", "R-draft")).json());
    expect(draft).toMatchObject({
      submitted_at: null,
      reflection: null,
      next_plan: null,
      total_minutes: 60,
    });
  });

  test("コメントを古い順に返す", async () => {
    const { get, reports, users } = await setup();
    const reportId = reports["R-sub"].id;
    await testDb.reportComment.createMany({
      data: [
        {
          reportId,
          userId: users.U1.id,
          body: "2番目",
          createdAt: new Date("2026-11-04T20:05:00+09:00"),
        },
        {
          reportId,
          userId: users.M1.id,
          body: "1番目",
          createdAt: new Date("2026-11-04T20:00:00+09:00"),
        },
      ],
    });
    const body = reportDetailSchema.parse(await (await get("M1", "R-sub")).json());
    expect(body.comments.map((c) => [c.body, c.user.name, c.created_at])).toEqual([
      ["1番目", "鈴木 一郎", "2026-11-04T20:00:00+09:00"],
      ["2番目", "山田 太郎", "2026-11-04T20:05:00+09:00"],
    ]);
  });

  test("VIEW-07: R-sub の権限フラグ。U1 は編集不可でコメント可、M1 は承認とコメント可、A1 はすべて不可", async () => {
    const { get } = await setup();
    const permissionsOf = async (role: Role) =>
      reportDetailSchema.parse(await (await get(role, "R-sub")).json()).permissions;
    expect(await permissionsOf("U1")).toEqual({
      can_edit: false,
      can_review: false,
      can_comment: true,
    });
    expect(await permissionsOf("M1")).toEqual({
      can_edit: false,
      can_review: true,
      can_comment: true,
    });
    expect(await permissionsOf("A1")).toEqual({
      can_edit: false,
      can_review: false,
      can_comment: false,
    });
  });

  test("下書きと差し戻しは、本人が編集できる", async () => {
    const { get } = await setup();
    for (const report of ["R-draft", "R-ret"] as const) {
      const body = reportDetailSchema.parse(await (await get("U1", report)).json());
      expect(body.permissions.can_edit, report).toBe(true);
    }
  });
});
