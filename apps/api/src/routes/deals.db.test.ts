import { dealDetailSchema, dealSchema, paginatedSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

const listSchema = paginatedSchema(dealSchema);

const asUser = async (role: "A1" | "M1" | "U1" = "U1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  return { ...data, client };
};

const errorOf = async (res: Response) =>
  (await res.json()).error as { code: string; details?: { field: string }[] };

type Data = Awaited<ReturnType<typeof asUser>>;

const newDeal = ({ customers, users }: Data, overrides: Record<string, unknown> = {}) => ({
  customer_id: customers.C1.id,
  name: "追加提案",
  owner_id: users.U1.id,
  stage: "lead",
  amount: 1_000_000,
  expected_close_date: "2027-01-31",
  ...overrides,
});

describe("POST /deals", () => {
  test("DEAL-01: 担当者が一般(U1)の商談を登録でき、商談の詳細を返す", async () => {
    const data = await asUser();
    const res = await data.client.json("POST", "/api/v1/deals", newDeal(data));
    expect(res.status).toBe(201);
    expect(dealDetailSchema.parse(await res.json())).toEqual({
      id: expect.any(Number),
      name: "追加提案",
      customer: { id: data.customers.C1.id, name: "A株式会社" },
      owner: { id: data.users.U1.id, name: "山田 太郎" },
      stage: "lead",
      amount: 1_000_000,
      expected_close_date: "2027-01-31",
      has_visits: false,
    });
  });

  test.each([
    ["DEAL-02: 担当者が上長(M1)", "M1"],
    ["DEAL-03: 担当者が無効なユーザー(X1)", "X1"],
    ["担当者が管理者(A1)", "A1"],
  ] as const)("%s は 422", async (_name, owner) => {
    const data = await asUser();
    const res = await data.client.json(
      "POST",
      "/api/v1/deals",
      newDeal(data, { owner_id: data.users[owner].id }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual(["owner_id"]);
  });

  test("DEAL-04: ステージが列挙値以外(estimate)は 422", async () => {
    const data = await asUser();
    const res = await data.client.json(
      "POST",
      "/api/v1/deals",
      newDeal(data, { stage: "estimate" }),
    );
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual(["stage"]);
  });

  test.each([
    [-1, 422],
    [0, 201],
    [2_147_483_647, 201],
    [2_147_483_648, 422],
    [100.5, 422],
  ])("DEAL-05: 見込金額 %d は %i", async (amount, status) => {
    const data = await asUser();
    const res = await data.client.json("POST", "/api/v1/deals", newDeal(data, { amount }));
    expect(res.status).toBe(status);
  });

  test("見込金額と受注予定日は省略でき、null で返す", async () => {
    const data = await asUser();
    const { amount: _a, expected_close_date: _d, ...body } = newDeal(data);
    const res = await data.client.json("POST", "/api/v1/deals", body);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ amount: null, expected_close_date: null });
  });

  test.each([
    ["存在しない顧客", { customer_id: 999999 }, "customer_id"],
    ["商談名が空", { name: " " }, "name"],
    ["商談名が101文字", { name: "あ".repeat(101) }, "name"],
    ["受注予定日の形式が不正", { expected_close_date: "2027/01/31" }, "expected_close_date"],
  ])("%s は 422", async (_name, overrides, field) => {
    const data = await asUser();
    const res = await data.client.json("POST", "/api/v1/deals", newDeal(data, overrides));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual([field]);
  });

  test.each(["A1", "M1"] as const)("%s も登録できる", async (role) => {
    const data = await asUser(role);
    const res = await data.client.json("POST", "/api/v1/deals", newDeal(data));
    expect(res.status).toBe(201);
  });
});

describe("GET /deals/{id}", () => {
  test("訪問記録がある商談は has_visits が true", async () => {
    const { client, deals } = await asUser("M1");
    const res = await client.request(`/api/v1/deals/${deals.D1.id}`);
    expect(res.status).toBe(200);
    expect(dealDetailSchema.parse(await res.json())).toMatchObject({
      name: "新サービス導入",
      stage: "proposal",
      amount: 3_000_000,
      expected_close_date: "2026-12-20",
      has_visits: true,
    });
  });

  test("下書きの日報の訪問だけでも has_visits は true", async () => {
    const { client, deals, reports } = await asUser();
    // D2 を下書き(R-draft)の訪問に紐づける
    await testDb.workEntry.updateMany({
      where: { reportId: reports["R-draft"].id, category: "visit" },
      data: { dealId: deals.D2.id },
    });
    const body = dealDetailSchema.parse(
      await (await client.request(`/api/v1/deals/${deals.D2.id}`)).json(),
    );
    expect(body.has_visits).toBe(true);
  });

  test("存在しない商談は 404", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/deals/999999");
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("PUT /deals/{id}", () => {
  test("DEAL-06: 訪問記録がある商談(D1)の顧客を C2 に変えると 409 CONFLICT", async () => {
    const data = await asUser();
    const res = await data.client.json(
      "PUT",
      `/api/v1/deals/${data.deals.D1.id}`,
      newDeal(data, { customer_id: data.customers.C2.id, name: "新サービス導入" }),
    );
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({ code: "CONFLICT" });
    const deal = await testDb.deal.findUniqueOrThrow({ where: { id: data.deals.D1.id } });
    expect(deal.customerId).toBe(data.customers.C1.id);
  });

  test("DEAL-07: 訪問記録がない商談の顧客は変更できる", async () => {
    const data = await asUser();
    const created = dealDetailSchema.parse(
      await (await data.client.json("POST", "/api/v1/deals", newDeal(data))).json(),
    );
    const res = await data.client.json(
      "PUT",
      `/api/v1/deals/${created.id}`,
      newDeal(data, { customer_id: data.customers.C2.id }),
    );
    expect(res.status).toBe(200);
    expect(dealDetailSchema.parse(await res.json()).customer).toEqual({
      id: data.customers.C2.id,
      name: "B株式会社",
    });
  });

  test("訪問記録がある商談でも、顧客を変えなければ他の項目を更新できる", async () => {
    const data = await asUser();
    const res = await data.client.json(
      "PUT",
      `/api/v1/deals/${data.deals.D1.id}`,
      newDeal(data, { name: "新サービス導入(拡大)", stage: "negotiation", amount: null }),
    );
    expect(res.status).toBe(200);
    expect(dealDetailSchema.parse(await res.json())).toMatchObject({
      name: "新サービス導入(拡大)",
      stage: "negotiation",
      amount: null,
      has_visits: true,
    });
  });

  test("担当者を無効なユーザーに変えると 422。担当者を変えなければ、担当者が無効になっていても更新できる", async () => {
    const data = await asUser();
    const path = `/api/v1/deals/${data.deals.D1.id}`;
    const toInactive = await data.client.json(
      "PUT",
      path,
      newDeal(data, { owner_id: data.users.X1.id }),
    );
    expect(toInactive.status).toBe(422);

    await testDb.user.update({ where: { id: data.users.U1.id }, data: { isActive: false } });
    const admin = await loginAs(createTestApp(), data.users.A1);
    const unchanged = await admin.json("PUT", path, newDeal(data, { name: "担当者そのまま" }));
    expect(unchanged.status).toBe(200);
  });

  test("存在しない商談は 404", async () => {
    const data = await asUser();
    const res = await data.client.json("PUT", "/api/v1/deals/999999", newDeal(data));
    expect(res.status).toBe(404);
  });
});

describe("GET /deals", () => {
  test("商談の一覧を、登録の新しい順に返す", async () => {
    const { client } = await asUser();
    const body = listSchema.parse(await (await client.request("/api/v1/deals")).json());
    expect(body.pagination).toEqual({ page: 1, per_page: 20, total: 2 });
    expect(body.items.map((deal) => deal.name)).toEqual(["保守契約の更新", "新サービス導入"]);
    expect(body.items[1]).toMatchObject({
      customer: { name: "A株式会社" },
      owner: { name: "山田 太郎" },
    });
  });

  test("DEAL-09: ステージを複数指定すると、そのステージの商談だけを返す", async () => {
    const data = await asUser();
    await data.client.json(
      "POST",
      "/api/v1/deals",
      newDeal(data, { stage: "won", name: "受注済み" }),
    );
    const res = await data.client.request("/api/v1/deals?stage=proposal&stage=negotiation");
    const body = listSchema.parse(await res.json());
    expect(body.items.map((deal) => deal.stage).sort()).toEqual(["negotiation", "proposal"]);

    const single = listSchema.parse(
      await (await data.client.request("/api/v1/deals?stage=won")).json(),
    );
    expect(single.items.map((deal) => deal.name)).toEqual(["受注済み"]);
  });

  test("商談名の部分一致、顧客、担当者で絞り込む", async () => {
    const { client, customers, users } = await asUser();
    const names = async (query: string) =>
      listSchema
        .parse(await (await client.request(`/api/v1/deals?${query}`)).json())
        .items.map((d) => d.name);
    expect(await names(`q=${encodeURIComponent("保守")}`)).toEqual(["保守契約の更新"]);
    expect(await names(`customer_id=${customers.C1.id}`)).toEqual(["新サービス導入"]);
    expect(await names(`owner_id=${users.U2.id}`)).toEqual(["保守契約の更新"]);
    expect(await names(`customer_id=${customers.C1.id}&owner_id=${users.U2.id}`)).toEqual([]);
  });

  test("ステージの値が不正なら 422", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/deals?stage=estimate");
    expect(res.status).toBe(422);
  });

  test("ページ送りする", async () => {
    const data = await asUser();
    await testDb.deal.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        customerId: data.customers.C1.id,
        ownerId: data.users.U1.id,
        name: `一括${i}`,
        stage: "lead" as const,
      })),
    });
    const page2 = listSchema.parse(
      await (
        await data.client.request(`/api/v1/deals?q=${encodeURIComponent("一括")}&page=2`)
      ).json(),
    );
    expect(page2.pagination).toEqual({ page: 2, per_page: 20, total: 21 });
    expect(page2.items).toHaveLength(1);
  });

  test("ログインしていなければ 401", async () => {
    await seedTestData(testDb);
    const res = await createTestApp().request("/api/v1/deals");
    expect(res.status).toBe(401);
  });
});
