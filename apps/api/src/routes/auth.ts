import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../auth/middleware";
import { verifyAgainstDummy, verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  createSession,
  deleteExpiredSessions,
  setSessionCookie,
} from "../auth/session";
import type { Db } from "../db";
import { AppError } from "../errors";
import { buildMeResponse } from "../me";
import { validate } from "../validator";

type Options = { db: Db; secureCookie: boolean };

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

/** POST /auth/login。ログイン前に呼ぶため、認証とCSRFのミドルウェアより前に登録する */
export const loginRoutes = ({ db, secureCookie }: Options) =>
  new Hono().post("/", validate("json", loginSchema), async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await db.user.findUnique({ where: { email } });
    const matched = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyAgainstDummy(password);
    // メールアドレス、パスワード、無効なユーザーのどれが原因かは区別しない(API仕様書 3章)
    if (!user || !matched || !user.isActive) {
      throw new AppError("UNAUTHENTICATED", "メールアドレスまたはパスワードが正しくありません");
    }

    await deleteExpiredSessions(db);
    const { token, session } = await createSession(db, user.id);
    setSessionCookie(c, token, secureCookie);
    return c.json(await buildMeResponse(db, user, session));
  });

/** POST /auth/logout。ログイン中のみ(CSRFトークンも必要) */
export const logoutRoutes = ({ db, secureCookie }: Options) =>
  new Hono<AuthEnv>().post("/", async (c) => {
    await db.session.deleteMany({ where: { id: c.var.session.id } });
    clearSessionCookie(c, secureCookie);
    return c.body(null, 204);
  });
