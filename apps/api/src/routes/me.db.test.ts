import { meSchema, subordinatesSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, TEST_PASSWORD } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

const login = (email: string, password: string) =>
  createTestApp().request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("GET /me", () => {
  test("AUTH-09: 一般は上長を返し、未読の通知数が実際の未読数と一致する", async () => {
    const { users, reports } = await seedTestData(testDb);
    await testDb.notification.createMany({
      data: [
        { userId: users.U1.id, reportId: reports["R-app"].id, type: "approved", message: "承認" },
        { userId: users.U1.id, reportId: reports["R-ret"].id, type: "returned", message: "差戻" },
        {
          userId: users.U1.id,
          reportId: reports["R-sub"].id,
          type: "commented",
          message: "既読",
          readAt: new Date(),
        },
        // 他のユーザー宛ては数えない
        { userId: users.U2.id, type: "reminder", message: "未提出" },
      ],
    });
    const client = await loginAs(createTestApp(), users.U1);
    const res = await client.request("/api/v1/me");
    expect(res.status).toBe(200);
    const me = meSchema.parse(await res.json());
    expect(me).toEqual({
      id: users.U1.id,
      name: "山田 太郎",
      email: "u1@example.com",
      role: "member",
      manager: { id: users.M1.id, name: "鈴木 一郎" },
      unread_notification_count: 2,
      csrf_token: client.csrfToken,
    });
  });

  test.each(["M1", "A1"] as const)("AUTH-10: %s(上長、管理者)は manager が null", async (key) => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users[key]);
    const me = meSchema.parse(await (await client.request("/api/v1/me")).json());
    expect(me.manager).toBeNull();
  });
});

describe("PUT /me/password", () => {
  test("AUTH-11: 変更すると新しいパスワードでログインでき、古いパスワードではできない", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.U1);
    const res = await client.json("PUT", "/api/v1/me/password", {
      current_password: TEST_PASSWORD,
      new_password: "newpass12",
    });
    expect(res.status).toBe(204);
    expect((await login("u1@example.com", "newpass12")).status).toBe(200);
    expect((await login("u1@example.com", TEST_PASSWORD)).status).toBe(401);

    const user = await testDb.user.findUniqueOrThrow({ where: { id: users.U1.id } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    // 変更した本人のセッションは、そのまま使える
    expect((await client.request("/api/v1/me")).status).toBe(200);
  });

  test("変更すると、本人の他の端末のセッションは使えなくなり、他のユーザーのセッションは残る", async () => {
    const { users } = await seedTestData(testDb);
    const app = createTestApp();
    const pc = await loginAs(app, users.U1);
    const phone = await loginAs(app, users.U1);
    const other = await loginAs(app, users.U2);

    const res = await pc.json("PUT", "/api/v1/me/password", {
      current_password: TEST_PASSWORD,
      new_password: "newpass12",
    });
    expect(res.status).toBe(204);

    expect((await pc.request("/api/v1/me")).status).toBe(200);
    expect((await phone.request("/api/v1/me")).status).toBe(401);
    expect((await other.request("/api/v1/me")).status).toBe(200);
    expect(await testDb.session.count({ where: { userId: users.U1.id } })).toBe(1);
  });

  test("失敗した場合は、他の端末のセッションも残る", async () => {
    const { users } = await seedTestData(testDb);
    const app = createTestApp();
    const pc = await loginAs(app, users.U1);
    const phone = await loginAs(app, users.U1);
    const res = await pc.json("PUT", "/api/v1/me/password", {
      current_password: "wrong-password",
      new_password: "newpass12",
    });
    expect(res.status).toBe(422);
    expect((await phone.request("/api/v1/me")).status).toBe(200);
  });

  test.each([
    [
      "AUTH-12: 現在のパスワードが誤り",
      { current_password: "wrong-password", new_password: "newpass12" },
      "current_password",
    ],
    [
      "AUTH-13: 新しいパスワードが7文字",
      { current_password: TEST_PASSWORD, new_password: "1234567" },
      "new_password",
    ],
    [
      "AUTH-14: 現在と同じパスワード",
      { current_password: TEST_PASSWORD, new_password: TEST_PASSWORD },
      "new_password",
    ],
  ])("%s は 422", async (_name, body, field) => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.U1);
    const res = await client.json("PUT", "/api/v1/me/password", body);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.details.map((d: { field: string }) => d.field)).toEqual([field]);
    // 失敗した場合はパスワードが変わらない
    expect((await login("u1@example.com", TEST_PASSWORD)).status).toBe(200);
  });

  test("CSRFトークンがなければ 403", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.U1);
    const res = await client.request("/api/v1/me/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "" },
      body: JSON.stringify({ current_password: TEST_PASSWORD, new_password: "newpass12" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /me/subordinates", () => {
  test("AUTH-15: 直属の部下のうち有効なユーザーだけを返す(無効な X1 と他の上長の部下 U3 は含まない)", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users.M1);
    const res = await client.request("/api/v1/me/subordinates");
    expect(res.status).toBe(200);
    expect(subordinatesSchema.parse(await res.json())).toEqual({
      items: [
        { id: users.U1.id, name: "山田 太郎" },
        { id: users.U2.id, name: "佐藤 花子" },
      ],
    });
  });

  test.each(["U1", "A1"] as const)("AUTH-16: %s(上長以外)は 403", async (key) => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), users[key]);
    const res = await client.request("/api/v1/me/subordinates");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
