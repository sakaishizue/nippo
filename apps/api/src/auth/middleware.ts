import type { Role } from "@nippo/shared";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Session, User } from "../../generated/prisma/client";
import { now } from "../clock";
import type { Db } from "../db";
import { AppError } from "../errors";
import {
  clearSessionCookie,
  expiresFrom,
  hashSessionToken,
  SESSION_COOKIE,
  SESSION_EXTEND_INTERVAL_MS,
  SESSION_TTL_MS,
  safeEqual,
  setSessionCookie,
} from "./session";

/** ログイン後のルートで使える変数 */
export type AuthEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};

const unauthenticated = () => new AppError("UNAUTHENTICATED", "ログインしてください");

type AuthOptions = { db: Db; secureCookie: boolean };

/** セッションの Cookie を確かめ、ログイン中のユーザーを c.var.user に入れる。ログインしていなければ 401 */
export const authenticate = ({ db, secureCookie }: AuthOptions) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw unauthenticated();

    const session = await db.session.findUnique({
      where: { id: hashSessionToken(token) },
      include: { user: true },
    });
    const current = now();
    if (!session || session.expiresAt <= current) {
      if (session) await db.session.delete({ where: { id: session.id } });
      clearSessionCookie(c, secureCookie);
      throw unauthenticated();
    }
    // 無効化されたユーザーのセッションは、次のリクエストで無効にする(API仕様書 1.2)
    if (!session.user.isActive) {
      await db.session.deleteMany({ where: { userId: session.userId } });
      clearSessionCookie(c, secureCookie);
      throw unauthenticated();
    }

    // 最後のアクセスから7日に延長する。前回の延長から1時間以上経っていれば書き込む
    const elapsed = SESSION_TTL_MS - (session.expiresAt.getTime() - current.getTime());
    if (elapsed >= SESSION_EXTEND_INTERVAL_MS) {
      session.expiresAt = expiresFrom(current);
      await db.session.update({
        where: { id: session.id },
        data: { expiresAt: session.expiresAt },
      });
      setSessionCookie(c, token, secureCookie);
    }

    const { user, ...rest } = session;
    c.set("user", user);
    c.set("session", rest);
    await next();
  });

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 更新系のリクエストで、X-CSRF-Token ヘッダーとセッションのトークンを照合する。一致しなければ 403 */
export const csrfProtection = () =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (UNSAFE_METHODS.has(c.req.method)) {
      const header = c.req.header("X-CSRF-Token");
      if (!header || !safeEqual(header, c.var.session.csrfToken)) {
        throw new AppError("FORBIDDEN", "不正なリクエストです。画面を再読み込みしてください");
      }
    }
    await next();
  });

/** 指定したロールのユーザーだけを通す。それ以外は 403 */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    if (!roles.includes(c.var.user.role)) {
      throw new AppError("FORBIDDEN", "この操作をする権限がありません");
    }
    await next();
  });
