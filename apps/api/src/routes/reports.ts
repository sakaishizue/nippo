import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../auth/middleware";
import type { Db } from "../db";
import { AppError } from "../errors";
import { findReportDetail } from "../reports/detail";
import { validate } from "../validator";

type Options = { db: Db };

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** 閲覧範囲の外の日報は、存在を知られないよう 404 にする(API仕様書 1.3) */
export const reportNotFound = () => new AppError("NOT_FOUND", "日報が見つかりません");

/** 日報API(API仕様書 5章) */
export const reportsRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>()
    // `/reports/pending` などと区別するため、ID は数字だけ
    .get("/:id{[0-9]+}", validate("param", idParamSchema), async (c) => {
      const detail = await findReportDetail(db, c.req.valid("param").id, c.var.user);
      if (!detail) throw reportNotFound();
      return c.json(detail);
    });
