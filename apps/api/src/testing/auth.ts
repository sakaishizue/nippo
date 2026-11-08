import { createApp } from "../app";
import { SESSION_COOKIE } from "../auth/session";
import { TEST_PASSWORD } from "./fixtures";
import { testDb } from "./test-db";

/** テスト用データベースにつながるアプリ。Cookie は本番と同じく Secure を付ける */
export const createTestApp = () => createApp({ db: testDb, secureCookie: true });

type TestApp = ReturnType<typeof createTestApp>;

/** レスポンスの Set-Cookie から、セッションの Cookie を `name=value` の形で取り出す */
export const sessionCookieOf = (res: Response): string | undefined =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));

/**
 * テストデータのユーザーでログインし、そのユーザーとして API を呼ぶクライアントを返す。
 * セッションの Cookie と CSRFトークンは自動で付ける
 */
export const loginAs = async (app: TestApp, user: { email: string }) => {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: TEST_PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`${user.email} でログインできません: ${res.status}`);
  const cookie = sessionCookieOf(res);
  if (!cookie) throw new Error("セッションの Cookie がありません");
  const { csrf_token: csrfToken } = (await res.json()) as { csrf_token: string };

  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { cookie, "X-CSRF-Token": csrfToken, ...init.headers },
    });
  const json = (method: string, path: string, body?: unknown) =>
    request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

  return { cookie, csrfToken, request, json };
};
