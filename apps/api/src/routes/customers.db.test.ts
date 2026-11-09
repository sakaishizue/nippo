import { customerDetailSchema, customerListItemSchema, paginatedSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

const listSchema = paginatedSchema(customerListItemSchema);

const asUser = async (role: "A1" | "M1" | "U1" = "U1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  return { ...data, client };
};

const errorOf = async (res: Response) =>
  (await res.json()).error as { code: string; details?: { field: string }[] };

describe("POST /customers", () => {
  test("CUS-01: 新しい顧客名で登録でき、顧客の詳細を返す", async () => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", {
      name: "C株式会社",
      address: "福岡県福岡市中央区天神3-3-3",
      phone: "092-123-4567",
    });
    expect(res.status).toBe(201);
    const body = customerDetailSchema.parse(await res.json());
    expect(body).toMatchObject({
      name: "C株式会社",
      address: "福岡県福岡市中央区天神3-3-3",
      phone: "092-123-4567",
      deals: [],
    });
    expect(await testDb.customer.count({ where: { name: "C株式会社" } })).toBe(1);
  });

  test("CUS-02: 既存の顧客と同じ名前は 409 DUPLICATE_CUSTOMER_NAME", async () => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", { name: "A株式会社" });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({ code: "DUPLICATE_CUSTOMER_NAME" });
    expect(await testDb.customer.count({ where: { name: "A株式会社" } })).toBe(1);
  });

  test("CUS-03: confirm_duplicate が true なら、同じ名前でも登録できる", async () => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", {
      name: "A株式会社",
      confirm_duplicate: true,
    });
    expect(res.status).toBe(201);
    expect(await testDb.customer.count({ where: { name: "A株式会社" } })).toBe(2);
  });

  test("前後の空白は除いてから、名前の重複を確かめる", async () => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", { name: " A株式会社 " });
    expect(res.status).toBe(409);
  });

  test.each([
    ["03-1234-5678", 201],
    ["03(1234)5678", 422],
  ])("CUS-05: 電話番号 %s は %i", async (phone, status) => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", { name: "電話 株式会社", phone });
    expect(res.status).toBe(status);
    if (status === 422) {
      expect(await errorOf(res)).toMatchObject({
        code: "VALIDATION_ERROR",
        details: [{ field: "phone" }],
      });
    }
  });

  test.each([
    ["顧客名が空", { name: "  " }, "name"],
    ["顧客名が101文字", { name: "あ".repeat(101) }, "name"],
    ["住所が201文字", { name: "住所 株式会社", address: "あ".repeat(201) }, "address"],
    ["電話番号が21文字", { name: "電話 株式会社", phone: "0".repeat(21) }, "phone"],
  ])("%s は 422", async (_name, body, field) => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", body);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.map((d) => d.field)).toEqual([field]);
  });

  test("上限ちょうどの長さは登録できる。空の住所と電話番号は null にする", async () => {
    const { client } = await asUser();
    const res = await client.json("POST", "/api/v1/customers", {
      name: "あ".repeat(100),
      address: "",
      phone: "0".repeat(20),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ address: null, phone: "0".repeat(20) });
  });

  test.each(["A1", "M1", "U1"] as const)("CUS-06: %s も登録できる", async (role) => {
    const { client } = await asUser(role);
    const res = await client.json("POST", "/api/v1/customers", { name: `${role}の顧客` });
    expect(res.status).toBe(201);
  });

  test("ログインしていなければ 401", async () => {
    await seedTestData(testDb);
    const res = await createTestApp().request("/api/v1/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "未ログイン 株式会社" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /customers", () => {
  test("顧客の一覧に、商談数と最終訪問日を付けて返す", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/customers");
    expect(res.status).toBe(200);
    const body = listSchema.parse(await res.json());
    expect(body.pagination).toEqual({ page: 1, per_page: 20, total: 2 });
    expect(body.items).toEqual([
      {
        id: expect.any(Number),
        name: "A株式会社",
        address: "東京都千代田区丸の内1-1-1",
        phone: "03-1234-5678",
        deal_count: 1,
        last_visited_on: "2026-11-04",
      },
      {
        id: expect.any(Number),
        name: "B株式会社",
        address: "大阪府大阪市北区梅田2-2-2",
        phone: "06-1234-5678",
        deal_count: 1,
        last_visited_on: "2026-11-04",
      },
    ]);
  });

  test("CUS-10: 下書きと差し戻しの訪問は、最終訪問日に含めない", async () => {
    const { client, customers } = await asUser();
    // C1 は下書き(11月5日)に新しい訪問がある。最終訪問日は提出済みの11月4日
    // C2 は差し戻し(11月3日)と U3 の提出済み(11月4日)。U3 の提出済みを除くと、差し戻しだけになる
    await testDb.dailyReport.deleteMany({
      where: { status: "submitted", user: { email: "u3@example.com" } },
    });
    const body = listSchema.parse(await (await client.request("/api/v1/customers")).json());
    const byId = new Map(body.items.map((item) => [item.id, item.last_visited_on]));
    expect(byId.get(customers.C1.id)).toBe("2026-11-04");
    expect(byId.get(customers.C2.id)).toBeNull();
  });

  test("訪問のない顧客は、最終訪問日が null で商談数が0", async () => {
    const { client } = await asUser();
    await testDb.customer.create({ data: { name: "訪問なし 株式会社" } });
    const body = listSchema.parse(
      await (await client.request("/api/v1/customers?q=訪問なし")).json(),
    );
    expect(body.items).toMatchObject([
      { name: "訪問なし 株式会社", deal_count: 0, last_visited_on: null },
    ]);
  });

  test("顧客名の部分一致で検索する", async () => {
    const { client } = await asUser();
    const res = await client.request(`/api/v1/customers?q=${encodeURIComponent("B株")}`);
    const body = listSchema.parse(await res.json());
    expect(body.items.map((item) => item.name)).toEqual(["B株式会社"]);
    expect(body.pagination.total).toBe(1);
  });

  test("ページ送りする", async () => {
    const { client } = await asUser();
    await testDb.customer.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({ name: `Z顧客${String(i).padStart(2, "0")}` })),
    });
    const page2 = listSchema.parse(
      await (await client.request("/api/v1/customers?q=Z顧客&page=2")).json(),
    );
    expect(page2.pagination).toEqual({ page: 2, per_page: 20, total: 21 });
    expect(page2.items.map((item) => item.name)).toEqual(["Z顧客20"]);
  });

  test("ページの指定が不正なら 422", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/customers?per_page=101");
    expect(res.status).toBe(422);
  });
});

describe("GET /customers/{id}", () => {
  test("顧客情報と商談の一覧を返す", async () => {
    const { client, customers, deals, users } = await asUser("M1");
    const res = await client.request(`/api/v1/customers/${customers.C1.id}`);
    expect(res.status).toBe(200);
    expect(customerDetailSchema.parse(await res.json())).toEqual({
      id: customers.C1.id,
      name: "A株式会社",
      address: "東京都千代田区丸の内1-1-1",
      phone: "03-1234-5678",
      deals: [
        {
          id: deals.D1.id,
          name: "新サービス導入",
          owner: { id: users.U1.id, name: "山田 太郎" },
          stage: "proposal",
          amount: 3_000_000,
          expected_close_date: "2026-12-20",
        },
      ],
    });
  });

  test("金額と受注予定日のない商談は null", async () => {
    const { client, customers } = await asUser();
    const body = customerDetailSchema.parse(
      await (await client.request(`/api/v1/customers/${customers.C2.id}`)).json(),
    );
    expect(body.deals).toMatchObject([
      { name: "保守契約の更新", amount: null, expected_close_date: null },
    ]);
  });

  test("存在しない顧客は 404", async () => {
    const { client } = await asUser();
    const res = await client.request("/api/v1/customers/999999");
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("PUT /customers/{id}", () => {
  test("CUS-04: 名前を変えずに更新でき、自分自身との重複にはならない", async () => {
    const { client, customers } = await asUser();
    const res = await client.json("PUT", `/api/v1/customers/${customers.C1.id}`, {
      name: "A株式会社",
      address: "東京都千代田区丸の内9-9-9",
      phone: "03-9999-9999",
    });
    expect(res.status).toBe(200);
    expect(customerDetailSchema.parse(await res.json())).toMatchObject({
      name: "A株式会社",
      address: "東京都千代田区丸の内9-9-9",
      phone: "03-9999-9999",
    });
  });

  test("他の顧客と同じ名前は 409。確認済みなら更新できる", async () => {
    const { client, customers } = await asUser();
    const path = `/api/v1/customers/${customers.C2.id}`;
    const duplicate = await client.json("PUT", path, { name: "A株式会社" });
    expect(duplicate.status).toBe(409);
    expect(await errorOf(duplicate)).toMatchObject({ code: "DUPLICATE_CUSTOMER_NAME" });

    const confirmed = await client.json("PUT", path, {
      name: "A株式会社",
      confirm_duplicate: true,
    });
    expect(confirmed.status).toBe(200);
  });

  test("住所と電話番号を空にすると null にする", async () => {
    const { client, customers } = await asUser("A1");
    const res = await client.json("PUT", `/api/v1/customers/${customers.C1.id}`, {
      name: "A株式会社",
      address: "",
      phone: null,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ address: null, phone: null });
  });

  test("存在しない顧客は 404", async () => {
    const { client } = await asUser();
    const res = await client.json("PUT", "/api/v1/customers/999999", { name: "なし" });
    expect(res.status).toBe(404);
  });

  test("CSRFトークンがなければ 403", async () => {
    const { client, customers } = await asUser();
    const res = await createTestApp().request(`/api/v1/customers/${customers.C1.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie: client.cookie },
      body: JSON.stringify({ name: "A株式会社" }),
    });
    expect(res.status).toBe(403);
  });
});
