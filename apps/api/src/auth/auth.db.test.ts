import { describe, expect, test } from "vitest";
import { now, setNow } from "../clock";
import { createTestApp, loginAs, sessionCookieOf } from "../testing/auth";
import { seedTestData, TEST_PASSWORD } from "../testing/fixtures";
import { testDb } from "../testing/test-db";
import { hashSessionToken, SESSION_COOKIE } from "./session";

const LOGIN_FAILED = "メールアドレスまたはパスワードが正しくありません";

const login = (app: ReturnType<typeof createTestApp>, email: string, password: string) =>
  app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("POST /auth/login", () => {
  test("AUTH-01: 正しいメールアドレスとパスワードでログインできる", async () => {
    const { users } = await seedTestData(testDb);
    const res = await login(createTestApp(), "u1@example.com", TEST_PASSWORD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: users.U1.id,
      name: "山田 太郎",
      email: "u1@example.com",
      role: "member",
      manager: { id: users.M1.id, name: "鈴木 一郎" },
      unread_notification_count: 0,
      csrf_token: expect.any(String),
    });
    expect(body.csrf_token.length).toBeGreaterThanOrEqual(43);
  });

  test.each([
    ["AUTH-02: パスワード誤り", "u1@example.com", "wrong-password"],
    ["AUTH-03: 存在しないメールアドレス", "nobody@example.com", TEST_PASSWORD],
    ["AUTH-04: 無効なユーザー", "x1@example.com", TEST_PASSWORD],
  ])("%s は 401 で、原因を区別しないメッセージを返す", async (_name, email, password) => {
    await seedTestData(testDb);
    const res = await login(createTestApp(), email, password);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: LOGIN_FAILED } });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  test("入力が足りないと 422", async () => {
    const res = await createTestApp().request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u1@example.com" }),
    });
    expect(res.status).toBe(422);
  });

  test("NFR-08: Cookie に HttpOnly、Secure、SameSite=Lax と7日の有効期限が付く", async () => {
    await seedTestData(testDb);
    const res = await login(createTestApp(), "u1@example.com", TEST_PASSWORD);
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(setCookie).toBeDefined();
    const attributes = setCookie?.split("; ").slice(1) ?? [];
    expect(attributes).toEqual(
      expect.arrayContaining(["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=604800"]),
    );
  });

  test("データベースにはセッションIDのハッシュ値だけを保存する", async () => {
    await seedTestData(testDb);
    const res = await login(createTestApp(), "u1@example.com", TEST_PASSWORD);
    const token = sessionCookieOf(res)?.split("=")[1] ?? "";
    const sessions = await testDb.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(hashSessionToken(token));
    expect(sessions[0]?.id).not.toBe(token);
  });

  test("NFR-07: パスワードは Argon2id のハッシュ値で保存され、平文では保存されない", async () => {
    await seedTestData(testDb);
    const users = await testDb.user.findMany({ select: { passwordHash: true } });
    for (const { passwordHash } of users) {
      expect(passwordHash).toMatch(/^\$argon2id\$/);
      expect(passwordHash).not.toContain(TEST_PASSWORD);
    }
  });

  test("ログインのたびに新しいセッションを作り、期限切れのセッションを消す", async () => {
    await seedTestData(testDb);
    const app = createTestApp();
    setNow(new Date("2026-11-01T09:00:00+09:00"));
    await loginAs(app, { email: "u1@example.com" });
    setNow(new Date("2026-11-09T09:00:00+09:00"));
    await loginAs(app, { email: "u2@example.com" });
    const sessions = await testDb.session.findMany({ include: { user: true } });
    expect(sessions.map((s) => s.user.email)).toEqual(["u2@example.com"]);
  });
});

describe("認証", () => {
  test("AUTH-05: ログインせずに API を呼ぶと 401(未定義のURLも含む)", async () => {
    const res = await createTestApp().request("/api/v1/reports");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  test("ログイン中は、未定義のURLが 404 になる", async () => {
    await seedTestData(testDb);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });
    const res = await client.request("/api/v1/no-such-api");
    expect(res.status).toBe(404);
  });

  test("不正なセッションの Cookie は 401", async () => {
    const res = await createTestApp().request("/api/v1/reports", {
      headers: { cookie: `${SESSION_COOKIE}=forged-token` },
    });
    expect(res.status).toBe(401);
  });

  test("AUTH-06: ログアウトすると 204 を返し、その後は 401", async () => {
    await seedTestData(testDb);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });
    const res = await client.request("/api/v1/auth/logout", { method: "POST" });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`));
    expect(await testDb.session.count()).toBe(0);
    expect((await client.request("/api/v1/me")).status).toBe(401);
  });

  test("AUTH-08: ログイン中に無効化されたユーザーは、次のリクエストで 401 になり、セッションが消える", async () => {
    const { users } = await seedTestData(testDb);
    const client = await loginAs(createTestApp(), { email: "u2@example.com" });
    await testDb.user.update({ where: { id: users.U2.id }, data: { isActive: false } });
    const res = await client.request("/api/v1/me");
    expect(res.status).toBe(401);
    expect(await testDb.session.count()).toBe(0);
  });
});

describe("CSRF", () => {
  test("AUTH-07: X-CSRF-Token を付けずに更新系の API を呼ぶと 403", async () => {
    await seedTestData(testDb);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });
    const res = await client.request("/api/v1/reports", {
      method: "POST",
      headers: { "X-CSRF-Token": "" },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("別のセッションのトークンでは 403、正しいトークンなら通る", async () => {
    await seedTestData(testDb);
    const app = createTestApp();
    const u1 = await loginAs(app, { email: "u1@example.com" });
    const u2 = await loginAs(app, { email: "u2@example.com" });
    const wrong = await u1.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": u2.csrfToken },
    });
    expect(wrong.status).toBe(403);
    const ok = await u1.request("/api/v1/auth/logout", { method: "POST" });
    expect(ok.status).toBe(204);
  });

  test("参照系(GET)には CSRF トークンがいらない", async () => {
    await seedTestData(testDb);
    const { cookie } = await loginAs(createTestApp(), { email: "u1@example.com" });
    const res = await createTestApp().request("/api/v1/no-such-api", { headers: { cookie } });
    expect(res.status).toBe(404);
  });
});

describe("セッションの有効期限(最後のアクセスから7日)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const start = new Date("2026-11-02T09:00:00+09:00");

  test("7日間アクセスがなければ 401 になり、セッションが消える", async () => {
    await seedTestData(testDb);
    setNow(start);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });
    setNow(new Date(start.getTime() + 7 * DAY));
    const res = await client.request("/api/v1/me");
    expect(res.status).toBe(401);
    expect(await testDb.session.count()).toBe(0);
    // 401 のレスポンスでも、ブラウザーに残った Cookie を消す
    expect(res.headers.getSetCookie().join()).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`));
  });

  test("アクセスのたびに7日延長し、Cookie も送り直す", async () => {
    await seedTestData(testDb);
    setNow(start);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });

    setNow(new Date(start.getTime() + 6 * DAY));
    const res = await client.request("/api/v1/me");
    expect(res.status).toBe(404); // GET /me は Issue #10 で作る。認証は通っている
    expect(sessionCookieOf(res)).toBe(client.cookie);
    const session = await testDb.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBe(now().getTime() + 7 * DAY);

    // 延長したので、ログインから12日後でも使える
    setNow(new Date(start.getTime() + 12 * DAY));
    expect((await client.request("/api/v1/me")).status).toBe(404);
  });

  test("前回の延長から1時間たっていなければ、データベースに書き込まない", async () => {
    await seedTestData(testDb);
    setNow(start);
    const client = await loginAs(createTestApp(), { email: "u1@example.com" });
    const before = await testDb.session.findFirstOrThrow();

    setNow(new Date(start.getTime() + 30 * 60 * 1000));
    const res = await client.request("/api/v1/me");
    expect(sessionCookieOf(res)).toBeUndefined();
    const after = await testDb.session.findFirstOrThrow();
    expect(after.expiresAt).toEqual(before.expiresAt);
  });
});
