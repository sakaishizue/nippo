import { expect, test } from "@playwright/test";

// 画面と同じオリジンから /api が API に届くこと(開発サーバーの転送と API の起動)を確認する
test("画面のオリジンから API のヘルスチェックを呼べる", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("存在しない API は 404 NOT_FOUND を JSON で返す", async ({ request }) => {
  const res = await request.get("/api/v1/no-such-api");
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});
