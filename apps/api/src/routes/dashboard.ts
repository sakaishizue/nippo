import { type ManagerDashboard, type MemberDashboard, todayInJst } from "@nippo/shared";
import { Hono } from "hono";
import type { User } from "../../generated/prisma/client";
import { type AuthEnv, requireRole } from "../auth/middleware";
import { previousBusinessDay } from "../business-day";
import { now } from "../clock";
import { toDateOnly } from "../dates";
import type { Db } from "../db";

type Options = { db: Db };

/** ホームの「直近」の日数(今日を含む) */
const RECENT_DAYS = 7;

const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** `YYYY-MM-DD` の days 日前の日付 */
const daysBefore = (date: string, days: number) => {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() - days);
  return toDateOnly(d);
};

const memberDashboard = async (db: Db, user: User): Promise<MemberDashboard> => {
  const today = todayInJst(now());
  const [todayReport, returned, recent] = await Promise.all([
    db.dailyReport.findUnique({
      where: { userId_reportDate: { userId: user.id, reportDate: toDbDate(today) } },
      select: { id: true, reportDate: true, status: true },
    }),
    db.dailyReport.findMany({
      where: { userId: user.id, status: "returned" },
      select: {
        id: true,
        reportDate: true,
        // 最新の差し戻しの理由
        reviews: {
          where: { action: "returned" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { reason: true },
        },
      },
      orderBy: { reportDate: "desc" },
    }),
    db.dailyReport.findMany({
      where: {
        userId: user.id,
        reportDate: { gte: toDbDate(daysBefore(today, RECENT_DAYS - 1)), lte: toDbDate(today) },
      },
      select: {
        id: true,
        reportDate: true,
        status: true,
        workEntries: { select: { minutes: true } },
      },
      orderBy: { reportDate: "desc" },
    }),
  ]);
  return {
    today_report: todayReport
      ? { id: todayReport.id, report_date: today, status: todayReport.status }
      : null,
    returned_reports: returned.map((report) => ({
      id: report.id,
      report_date: toDateOnly(report.reportDate),
      reason: report.reviews[0]?.reason ?? null,
    })),
    recent_reports: recent.map((report) => ({
      id: report.id,
      report_date: toDateOnly(report.reportDate),
      status: report.status,
      total_minutes: report.workEntries.reduce((sum, entry) => sum + entry.minutes, 0),
    })),
  };
};

const managerDashboard = async (db: Db, user: User): Promise<ManagerDashboard> => {
  const today = todayInJst(now());
  // 前営業日は、土日と祝日を除いた前の日(月曜日なら金曜日)
  const previousDay = previousBusinessDay(today);
  const [pendingCount, subordinates] = await Promise.all([
    db.dailyReport.count({ where: { user: { managerId: user.id }, status: "submitted" } }),
    db.user.findMany({
      where: { managerId: user.id, role: "member", isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);
  const reports = await db.dailyReport.findMany({
    where: {
      userId: { in: subordinates.map((sub) => sub.id) },
      reportDate: { in: [toDbDate(previousDay), toDbDate(today)] },
    },
    select: { id: true, userId: true, reportDate: true, status: true },
  });

  /** 部下のその日の日報。下書きは上長に見せないため、未提出(null)とする */
  const reportOf = (userId: number, date: string) => {
    const report = reports.find((r) => r.userId === userId && toDateOnly(r.reportDate) === date);
    return report && report.status !== "draft"
      ? { report_id: report.id, status: report.status }
      : null;
  };

  return {
    pending_count: pendingCount,
    subordinates: subordinates.map((sub) => ({
      user: sub,
      previous_business_day: reportOf(sub.id, previousDay),
      today: reportOf(sub.id, today),
    })),
  };
};

/** ホームの表示内容(API仕様書 4章)。一般と上長だけが使える */
export const dashboardRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>().get("/", requireRole("member", "manager"), async (c) => {
    const user = c.var.user;
    return c.json(
      user.role === "member" ? await memberDashboard(db, user) : await managerDashboard(db, user),
    );
  });
