import { type Calendar, calendarQuerySchema, datesOfMonth } from "@nippo/shared";
import { Hono } from "hono";
import type { AuthEnv } from "../auth/middleware";
import { holidayName, isBusinessDay } from "../business-day";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { validate } from "../validator";

type Options = { db: Db };

const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * サイドナビの月のカレンダー(API仕様書 4章 GET /calendar)。全員が使える。
 * 土日と祝日は API の営業日の判定と同じデータで返し、画面に祝日のデータを持たせない。
 * 日報のステータスは一般の自分の日報だけ(下書きを含む)。上長と管理者は、部下が複数いて1日1つにまとめられないため返さない
 */
export const calendarRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>().get("/", validate("query", calendarQuerySchema), async (c) => {
    const user = c.var.user;
    const { month } = c.req.valid("query");
    const dates = datesOfMonth(month);
    const reports =
      user.role === "member"
        ? await db.dailyReport.findMany({
            where: {
              userId: user.id,
              reportDate: {
                gte: toDbDate(dates[0] as string),
                lte: toDbDate(dates.at(-1) as string),
              },
            },
            select: { id: true, reportDate: true, status: true },
          })
        : [];
    const reportOn = new Map(reports.map((r) => [toDateOnly(r.reportDate), r]));
    const body: Calendar = {
      month,
      days: dates.map((date) => {
        const report = reportOn.get(date);
        return {
          date,
          day_off: !isBusinessDay(date),
          holiday_name: holidayName(date),
          report: report ? { id: report.id, status: report.status } : null,
        };
      }),
    };
    return c.json(body);
  });
