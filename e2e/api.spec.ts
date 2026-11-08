import { expect, test } from "@playwright/test";

// 画面と同じオリジンから /api が API に届くこと(開発サーバーの転送、API の起動、データベースへの接続)を確認する
test("画面のオリジンから API のヘルスチェックを呼べる", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("ログインしていなければ、存在しない API も 401 UNAUTHENTICATED を返す", async ({
  request,
}) => {
  const res = await request.get("/api/v1/no-such-api");
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
});

test("シードのユーザーでログインでき、ログイン後は存在しない API が 404 になる", async ({
  request,
}) => {
  const login = await request.post("/api/v1/auth/login", {
    data: { email: "u1@example.com", password: "password123" },
  });
  expect(login.status()).toBe(200);
  expect(await login.json()).toMatchObject({ name: "山田 太郎", role: "member" });

  // ログインの Cookie は request に保存され、以降のリクエストに付く
  const res = await request.get("/api/v1/no-such-api");
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
