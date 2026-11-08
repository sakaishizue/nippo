import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { now } from "../clock";
import type { Db } from "../db";

export const SESSION_COOKIE = "nippo_session";

/** セッションの有効期限。最後のアクセスから7日 */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 有効期限の延長は1時間ごとにまとめる。リクエストのたびにデータベースに書き込まないため
export const SESSION_EXTEND_INTERVAL_MS = 60 * 60 * 1000;

/** 推測できない乱数のトークン(256ビット) */
const newToken = (): string => randomBytes(32).toString("base64url");

/** データベースにはセッションIDのハッシュ値だけを保存する。漏えいしても Cookie を作れないようにするため */
export const hashSessionToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** 文字列を、比較にかかる時間から内容を推測されない方法で比べる */
export const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const expiresFrom = (date: Date): Date => new Date(date.getTime() + SESSION_TTL_MS);

/** セッションを作り、Cookie に入れるトークンを返す */
export const createSession = async (db: Db, userId: number) => {
  const token = newToken();
  const session = await db.session.create({
    data: {
      id: hashSessionToken(token),
      userId,
      csrfToken: newToken(),
      expiresAt: expiresFrom(now()),
    },
  });
  return { token, session };
};

export const deleteExpiredSessions = (db: Db) =>
  db.session.deleteMany({ where: { expiresAt: { lte: now() } } });

export const setSessionCookie = (c: Context, token: string, secure: boolean) => {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
};

export const clearSessionCookie = (c: Context, secure: boolean) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure });
};
