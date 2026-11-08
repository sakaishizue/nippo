import { changePasswordSchema } from "@nippo/shared";
import { Hono } from "hono";
import { type AuthEnv, requireRole } from "../auth/middleware";
import { hashPassword, verifyPassword } from "../auth/password";
import type { Db } from "../db";
import { AppError } from "../errors";
import { buildMeResponse } from "../me";
import { validate } from "../validator";

type Options = { db: Db };

/** ログイン中のユーザー自身に関するAPI(API仕様書 3章) */
export const meRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>()
    .get("/", async (c) => c.json(await buildMeResponse(db, c.var.user, c.var.session)))

    .put("/password", validate("json", changePasswordSchema), async (c) => {
      const { current_password, new_password } = c.req.valid("json");
      if (!(await verifyPassword(c.var.user.passwordHash, current_password))) {
        throw new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", {
          details: [{ field: "current_password", message: "現在のパスワードが正しくありません" }],
        });
      }
      const passwordHash = await hashPassword(new_password);
      // 他の端末のセッションは削除し、今の端末のセッションだけを残す。
      // パスワードが漏れて第三者にログインされていた場合に、変更で締め出せるようにするため
      await db.$transaction([
        db.user.update({ where: { id: c.var.user.id }, data: { passwordHash } }),
        db.session.deleteMany({
          where: { userId: c.var.user.id, id: { not: c.var.session.id } },
        }),
      ]);
      return c.body(null, 204);
    })

    .get("/subordinates", requireRole("manager"), async (c) => {
      const items = await db.user.findMany({
        where: { managerId: c.var.user.id, isActive: true },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      });
      return c.json({ items });
    });
