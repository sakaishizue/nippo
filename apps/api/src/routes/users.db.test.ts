import { userDetailSchema, userOptionsSchema, userSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, TEST_PASSWORD, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

const login = (email: string, password: string) =>
  createTestApp().request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

const asAdmin = async () => {
  const data = await seedTestData(testDb);
  const admin = await loginAs(createTestApp(), data.users.A1);
  return { ...data, admin };
};

const fieldsOf = async (res: Response) =>
  ((await res.json()).error.details as { field: string }[]).map((d) => d.field);

type Users = TestData["users"];

const newMember = (managerId: number | null) => ({
  name: "新人 一郎",
  email: "new@example.com",
  role: "member",
  manager_id: managerId,
  password: "newpass12",
  is_active: true,
});

describe("POST /users", () => {
  test("USR-01: 一般を上長付きで登録でき、そのユーザーでログインできる", async () => {
    const { admin, users } = await asAdmin();
    const res = await admin.json("POST", "/api/v1/users", newMember(users.M1.id));
    expect(res.status).toBe(201);
    expect(userDetailSchema.parse(await res.json())).toMatchObject({
      name: "新人 一郎",
      email: "new@example.com",
      role: "member",
      manager: { id: users.M1.id, name: "鈴木 一郎" },
      is_active: true,
      has_reports: false,
    });
    expect((await login("new@example.com", "newpass12")).status).toBe(200);
  });

  test("上長と管理者は上長なしで登録できる", async () => {
    const { admin } = await asAdmin();
    const res = await admin.json("POST", "/api/v1/users", {
      ...newMember(null),
      role: "manager",
    });
    expect(res.status).toBe(201);
    expect((await res.json()).manager).toBeNull();
  });

  test.each<[string, (u: Users) => object, string]>([
    ["USR-02: 一般で上長がない", () => newMember(null), "manager_id"],
    ["USR-03: 上長に一般(U2)を指定", (u) => newMember(u.U2.id), "manager_id"],
    ["上長に存在しないユーザーを指定", () => newMember(9999), "manager_id"],
    ["一般以外に上長を指定", (u) => ({ ...newMember(u.M1.id), role: "manager" }), "manager_id"],
    [
      "USR-04: メールアドレスの重複",
      (u) => ({ ...newMember(u.M1.id), email: "u1@example.com" }),
      "email",
    ],
    [
      "USR-05: パスワードが7文字",
      (u) => ({ ...newMember(u.M1.id), password: "1234567" }),
      "password",
    ],
    ["氏名が51文字", (u) => ({ ...newMember(u.M1.id), name: "あ".repeat(51) }), "name"],
  ])("%s は 422 で、登録しない", async (_name, body, field) => {
    const { admin, users } = await asAdmin();
    const before = await testDb.user.count();
    const res = await admin.json("POST", "/api/v1/users", body(users));
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual([field]);
    expect(await testDb.user.count()).toBe(before);
  });
});

describe("GET /users/{id}", () => {
  test("USR-11: パスワードの項目を返さない。日報があれば has_reports が true", async () => {
    const { admin, users } = await asAdmin();
    const res = await admin.request(`/api/v1/users/${users.U1.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["email", "has_reports", "id", "is_active", "manager", "name", "role"].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/password|argon2/i);
    expect(body.has_reports).toBe(true);

    const u2 = await (await admin.request(`/api/v1/users/${users.U2.id}`)).json();
    expect(u2.has_reports).toBe(false);
  });

  test("存在しないユーザーは 404", async () => {
    const { admin } = await asAdmin();
    expect((await admin.request("/api/v1/users/9999")).status).toBe(404);
  });
});

describe("PATCH /users/{id}", () => {
  test("USR-06: パスワードを再設定すると新しいパスワードでログインでき、そのユーザーのセッションはすべて消える", async () => {
    const { admin, users } = await asAdmin();
    const u1 = await loginAs(createTestApp(), users.U1);
    const res = await admin.json("PATCH", `/api/v1/users/${users.U1.id}`, {
      password: "reset-pass1",
    });
    expect(res.status).toBe(200);
    expect((await login("u1@example.com", "reset-pass1")).status).toBe(200);
    expect((await login("u1@example.com", TEST_PASSWORD)).status).toBe(401);
    expect((await u1.request("/api/v1/me")).status).toBe(401);
  });

  test("USR-07: 一般を上長に変えると、上長(manager_id)は null になる", async () => {
    const { admin, users } = await asAdmin();
    const res = await admin.json("PATCH", `/api/v1/users/${users.U2.id}`, { role: "manager" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "manager", manager: null });
    const u2 = await testDb.user.findUniqueOrThrow({ where: { id: users.U2.id } });
    expect(u2.managerId).toBeNull();
  });

  test("上長を一般に変えるときは、上長の指定が必要", async () => {
    const { admin, users } = await asAdmin();
    // 部下のいない上長を用意する
    const lonely = await testDb.user.create({
      data: { name: "部下なし", email: "lonely@example.com", role: "manager", passwordHash: "!" },
    });
    const missing = await admin.json("PATCH", `/api/v1/users/${lonely.id}`, { role: "member" });
    expect(missing.status).toBe(422);
    expect(await fieldsOf(missing)).toEqual(["manager_id"]);

    const ok = await admin.json("PATCH", `/api/v1/users/${lonely.id}`, {
      role: "member",
      manager_id: users.M1.id,
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ role: "member", manager: { id: users.M1.id } });
  });

  test.each([
    ["USR-08: 部下がいる上長(M1)の無効化", "M1", { is_active: false }],
    ["USR-09: 部下がいる上長(M1)のロール変更", "M1", { role: "member", manager_id: 0 }],
    ["USR-10: 自分自身(A1)の無効化", "A1", { is_active: false }],
    ["USR-10: 自分自身(A1)のロール変更", "A1", { role: "manager" }],
  ] as const)("%s は 409 CONFLICT", async (_name, key, body) => {
    const { admin, users } = await asAdmin();
    const payload = "manager_id" in body ? { ...body, manager_id: users.M2.id } : body;
    const res = await admin.json("PATCH", `/api/v1/users/${users[key].id}`, payload);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "CONFLICT" } });
    const after = await testDb.user.findUniqueOrThrow({ where: { id: users[key].id } });
    expect(after).toMatchObject({ role: users[key].role, isActive: true });
  });

  test("無効化すると、そのユーザーのセッションはすべて消える", async () => {
    const { admin, users } = await asAdmin();
    const u2 = await loginAs(createTestApp(), users.U2);
    const res = await admin.json("PATCH", `/api/v1/users/${users.U2.id}`, { is_active: false });
    expect(res.status).toBe(200);
    expect(await testDb.session.count({ where: { userId: users.U2.id } })).toBe(0);
    expect((await u2.request("/api/v1/me")).status).toBe(401);
  });

  test("送った項目だけを更新する。メールアドレスは自分自身との重複なら更新できる", async () => {
    const { admin, users } = await asAdmin();
    const res = await admin.json("PATCH", `/api/v1/users/${users.U1.id}`, {
      name: "山田 太郎(改)",
      email: "u1@example.com",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "山田 太郎(改)",
      email: "u1@example.com",
      role: "member",
      manager: { id: users.M1.id },
    });
  });

  test("他人のメールアドレスには変えられない", async () => {
    const { admin, users } = await asAdmin();
    const res = await admin.json("PATCH", `/api/v1/users/${users.U1.id}`, {
      email: "u2@example.com",
    });
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["email"]);
  });

  test("存在しないユーザーは 404", async () => {
    const { admin } = await asAdmin();
    expect((await admin.json("PATCH", "/api/v1/users/9999", { name: "x" })).status).toBe(404);
  });
});

describe("GET /users", () => {
  test("初期値は有効なユーザーのみ、ID順、ページ送り付き", async () => {
    const { admin } = await asAdmin();
    const res = await admin.request("/api/v1/users?per_page=2&page=2");
    const body = z
      .object({ items: z.array(userSchema), pagination: z.object({ total: z.number() }) })
      .parse(await res.json());
    expect(body.pagination.total).toBe(6); // 7人のうち X1(無効)を除く
    expect(body.items.map((u) => u.email)).toEqual(["m2@example.com", "u1@example.com"]);
  });

  test.each([
    ["氏名の部分一致", "q=山田", ["u1@example.com"]],
    ["メールアドレスの部分一致(大文字小文字を区別しない)", "q=U2@EXAMPLE", ["u2@example.com"]],
    ["ロール", "role=manager", ["m1@example.com", "m2@example.com"]],
    ["無効なユーザー", "is_active=false", ["x1@example.com"]],
  ])("%s で絞り込める", async (_name, query, emails) => {
    const { admin } = await asAdmin();
    const body = await (await admin.request(`/api/v1/users?${query}`)).json();
    expect(body.items.map((u: { email: string }) => u.email)).toEqual(emails);
  });

  test("一般のユーザーには上長を返す", async () => {
    const { admin, users } = await asAdmin();
    const body = await (await admin.request("/api/v1/users?q=u1@")).json();
    expect(body.items[0].manager).toEqual({ id: users.M1.id, name: "鈴木 一郎" });
  });

  test.each(["U1", "M1"] as const)("USR-13: %s(管理者以外)は 403", async (key) => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users[key]);
    for (const res of [
      await client.request("/api/v1/users"),
      await client.request(`/api/v1/users/${users.U1.id}`),
      await client.json("POST", "/api/v1/users", newMember(users.M1.id)),
      await client.json("PATCH", `/api/v1/users/${users.U1.id}`, { name: "x" }),
    ]) {
      expect(res.status).toBe(403);
    }
  });
});

describe("GET /user-options", () => {
  test("USR-12: 有効な一般だけを返し、項目は ID と氏名のみ(X1 は含まない)", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.U1);
    const res = await client.request("/api/v1/user-options?role=member");
    expect(res.status).toBe(200);
    expect(userOptionsSchema.strict().parse(await res.json())).toEqual({
      items: [
        { id: users.U1.id, name: "山田 太郎" },
        { id: users.U2.id, name: "佐藤 花子" },
        { id: users.U3.id, name: "田中 三郎" },
      ],
    });
  });

  test("role=manager は有効な上長を返す。全ロールが使える", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.A1);
    const body = await (await client.request("/api/v1/user-options?role=manager")).json();
    expect(body.items.map((u: { name: string }) => u.name)).toEqual(["鈴木 一郎", "高橋 次郎"]);
  });

  test("role がないか、admin を指定すると 422", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.U1);
    expect((await client.request("/api/v1/user-options")).status).toBe(422);
    expect((await client.request("/api/v1/user-options?role=admin")).status).toBe(422);
  });
});
