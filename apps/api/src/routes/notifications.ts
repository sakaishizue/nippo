import {
  type NotificationResponse,
  paginationQuerySchema,
  toJstDateTimeString,
} from "@nippo/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthEnv, requireRole } from "../auth/middleware";
import { now } from "../clock";
import type { Db } from "../db";
import { AppError } from "../errors";
import { validate } from "../validator";

type Options = { db: Db };

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const select = {
  id: true,
  type: true,
  message: true,
  reportId: true,
  readAt: true,
  createdAt: true,
} as const;

/** 通知API(API仕様書 9章)。管理者には通知が発生しないため、一般と上長だけが使える */
export const notificationsRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>()
    .use(requireRole("member", "manager"))

    // 自分宛ての通知を新しい順に返す(NTF-01)
    .get("/", validate("query", paginationQuerySchema), async (c) => {
      const { page, per_page } = c.req.valid("query");
      const where = { userId: c.var.user.id };
      const [rows, total] = await db.$transaction([
        db.notification.findMany({
          where,
          select,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * per_page,
          take: per_page,
        }),
        db.notification.count({ where }),
      ]);
      const items = rows.map(
        (row): NotificationResponse => ({
          id: row.id,
          type: row.type,
          message: row.message,
          report_id: row.reportId,
          read_at: row.readAt ? toJstDateTimeString(row.readAt) : null,
          created_at: toJstDateTimeString(row.createdAt),
        }),
      );
      return c.json({ items, pagination: { page, per_page, total } });
    })

    // 自分宛ての未読をすべて既読にする(NTF-05)
    .post("/read-all", async (c) => {
      await db.notification.updateMany({
        where: { userId: c.var.user.id, readAt: null },
        data: { readAt: now() },
      });
      return c.body(null, 204);
    })

    // 自分宛ての通知を既読にする。既読でも 204(NTF-03)。他人の通知は 404(NTF-04)
    .post("/:id{[0-9]+}/read", validate("param", idParamSchema), async (c) => {
      const { id } = c.req.valid("param");
      const notification = await db.notification.findFirst({
        where: { id, userId: c.var.user.id },
        select: { readAt: true },
      });
      if (!notification) throw new AppError("NOT_FOUND", "通知が見つかりません");
      // 既読日時は、最初に既読にしたときのままにする
      if (!notification.readAt) {
        await db.notification.updateMany({ where: { id, readAt: null }, data: { readAt: now() } });
      }
      return c.body(null, 204);
    });
