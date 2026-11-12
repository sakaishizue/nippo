import { workTimeSummaryQuerySchema } from "@nippo/shared";
import { Hono } from "hono";
import { type AuthEnv, requireRole } from "../auth/middleware";
import type { Db } from "../db";
import { validate } from "../validator";
import { summarizeWorkTime } from "../work-time-summary";

type Options = { db: Db };

/** 作業時間の集計(API仕様書 6章)。一般と上長だけが使える(管理者は 403、SUM-10) */
export const workTimeSummaryRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>().get(
    "/",
    requireRole("member", "manager"),
    validate("query", workTimeSummaryQuerySchema),
    async (c) => c.json(await summarizeWorkTime(db, c.var.user, c.req.valid("query"))),
  );
