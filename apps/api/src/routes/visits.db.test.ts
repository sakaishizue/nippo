import { customerVisitSchema, dealVisitSchema, paginatedSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// 訪問履歴(API仕様書 7章、8章、F-24)
const customerVisitsSchema = paginatedSchema(customerVisitSchema);
const dealVisitsSchema = paginatedSchema(dealVisitSchema);

const asUser = async (role: "A1" | "M2" | "U1" | "U2" = "U2") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  return { ...data, client };
};

// 日報の作業時間、所感、翌日の予定、コメントに当たる項目(CUS-09)
const HIDDEN_KEYS = ["minutes", "total_minutes", "reflection", "next_plan", "comments", "note"];

describe("GET /customers/{id}/visits", () => {
  test("CUS-07: 他の一般(U2)も、U1 の訪問記録を見られる", async () => {
    const { client, customers, users, deals } = await asUser("U2");
    const res = await client.request(`/api/v1/customers/${customers.C1.id}/visits`);
    expect(res.status).toBe(200);
    const body = customerVisitsSchema.parse(await res.json());
    expect(body.items[0]).toEqual({
      visit_id: expect.any(Number),
      visited_on: "2026-11-04",
      visitor: { id: users.U1.id, name: "山田 太郎" },
      deal: { id: deals.D1.id, name: "新サービス導入" },
      contact_name: "田中部長",
      content: "見積の条件の確認",
      next_action: null,
    });
  });

  test("CUS-08: 提出済みと承認済みの日報の訪問だけを、訪問日の新しい順に返す", async () => {
    const { client, customers } = await asUser();
    // C1: 承認済み(11月2日)、提出済み(11月4日)、下書き(11月5日)
    const c1 = customerVisitsSchema.parse(
      await (await client.request(`/api/v1/customers/${customers.C1.id}/visits`)).json(),
    );
    expect(c1.items.map((visit) => [visit.visited_on, visit.content])).toEqual([
      ["2026-11-04", "見積の条件の確認"],
      ["2026-11-02", "新サービスの提案"],
    ]);
    expect(c1.pagination).toEqual({ page: 1, per_page: 20, total: 2 });

    // C2: 差し戻し(11月3日)と、U3 の提出済み(11月4日)
    const c2 = customerVisitsSchema.parse(
      await (await client.request(`/api/v1/customers/${customers.C2.id}/visits`)).json(),
    );
    expect(c2.items.map((visit) => [visit.visited_on, visit.content, visit.deal])).toEqual([
      ["2026-11-04", "定例の打ち合わせ", null],
    ]);
  });

  test("CUS-09: 作業時間、所感、翌日の予定、コメントを返さない", async () => {
    const { client, customers } = await asUser();
    const body = (await (
      await client.request(`/api/v1/customers/${customers.C1.id}/visits`)
    ).json()) as {
      items: Record<string, unknown>[];
    };
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        [
          "contact_name",
          "content",
          "deal",
          "next_action",
          "visit_id",
          "visited_on",
          "visitor",
        ].sort(),
      );
      for (const key of HIDDEN_KEYS) expect(item).not.toHaveProperty(key);
    }
  });

  test.each(["A1", "M2", "U1"] as const)("%s も見られる", async (role) => {
    const { client, customers } = await asUser(role);
    const res = await client.request(`/api/v1/customers/${customers.C1.id}/visits`);
    expect(res.status).toBe(200);
  });

  test("ページ送りする", async () => {
    const { client, customers, users } = await asUser();
    // C1 への訪問がある承認済みの日報を、21件足す
    for (let i = 0; i < 21; i++) {
      await testDb.dailyReport.create({
        data: {
          userId: users.U2.id,
          reportDate: new Date(Date.UTC(2026, 9, i + 1)),
          status: "approved",
          workEntries: {
            create: {
              category: "visit",
              minutes: 30,
              visit: { create: { customerId: customers.C1.id, content: `訪問${i}` } },
            },
          },
        },
      });
    }
    const page2 = customerVisitsSchema.parse(
      await (await client.request(`/api/v1/customers/${customers.C1.id}/visits?page=2`)).json(),
    );
    expect(page2.pagination).toEqual({ page: 2, per_page: 20, total: 23 });
    expect(page2.items.map((visit) => visit.visited_on)).toEqual([
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
    ]);
  });

  test("存在しない顧客は 404", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/customers/999999/visits");
    expect(res.status).toBe(404);
  });

  test("ログインしていなければ 401", async () => {
    const { customers } = await seedTestData(testDb);
    const res = await createTestApp().request(`/api/v1/customers/${customers.C1.id}/visits`);
    expect(res.status).toBe(401);
  });
});

describe("GET /deals/{id}/visits", () => {
  test("DEAL-08: 作業の商談が D1 の訪問だけを、商談の代わりに顧客を付けて返す", async () => {
    const { client, customers, deals, users } = await asUser();
    const res = await client.request(`/api/v1/deals/${deals.D1.id}/visits`);
    expect(res.status).toBe(200);
    const body = dealVisitsSchema.parse(await res.json());
    expect(body.items).toEqual([
      {
        visit_id: expect.any(Number),
        visited_on: "2026-11-04",
        visitor: { id: users.U1.id, name: "山田 太郎" },
        customer: { id: customers.C1.id, name: "A株式会社" },
        contact_name: "田中部長",
        content: "見積の条件の確認",
        next_action: null,
      },
      {
        visit_id: expect.any(Number),
        visited_on: "2026-11-02",
        visitor: { id: users.U1.id, name: "山田 太郎" },
        customer: { id: customers.C1.id, name: "A株式会社" },
        contact_name: "田中部長",
        content: "新サービスの提案",
        next_action: "来週までに見積を提示",
      },
    ]);
  });

  test("DEAL-08: 下書きの訪問は返さず、作業時間や所感も返さない", async () => {
    const { client, deals, reports } = await asUser();
    // 下書き(R-draft)の訪問も D1 に紐づける
    await testDb.workEntry.updateMany({
      where: { reportId: reports["R-draft"].id },
      data: { dealId: deals.D1.id },
    });
    const body = (await (await client.request(`/api/v1/deals/${deals.D1.id}/visits`)).json()) as {
      items: Record<string, unknown>[];
    };
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("deal");
      for (const key of HIDDEN_KEYS) expect(item).not.toHaveProperty(key);
    }
  });

  test("訪問のない商談は空", async () => {
    const { client, deals } = await asUser();
    const body = dealVisitsSchema.parse(
      await (await client.request(`/api/v1/deals/${deals.D2.id}/visits`)).json(),
    );
    expect(body).toEqual({ items: [], pagination: { page: 1, per_page: 20, total: 0 } });
  });

  test("存在しない商談は 404", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/deals/999999/visits");
    expect(res.status).toBe(404);
  });
});
