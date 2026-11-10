import type { ReportListItem, reportListQuerySchema } from "@nippo/shared";
import type { z } from "zod";
import type { Prisma, User } from "../../generated/prisma/client";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { visibleReportsWhere } from "./access";

type Query = z.output<typeof reportListQuerySchema>;

const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * GET /reports の検索条件。閲覧範囲の条件を必ず含める(API仕様書 5章)。
 * 担当者の指定は、一般の場合は無視する(VIEW-02)
 */
export const reportSearchWhere = (
  viewer: Pick<User, "id" | "role">,
  query: Query,
): Prisma.DailyReportWhereInput => {
  const conditions: Prisma.DailyReportWhereInput[] = [visibleReportsWhere(viewer)];
  if (query.from || query.to) {
    conditions.push({
      reportDate: {
        ...(query.from && { gte: toDbDate(query.from) }),
        ...(query.to && { lte: toDbDate(query.to) }),
      },
    });
  }
  if (query.user_id !== undefined && viewer.role !== "member") {
    conditions.push({ userId: query.user_id });
  }
  if (query.customer_id !== undefined) {
    conditions.push({ workEntries: { some: { visit: { customerId: query.customer_id } } } });
  }
  if (query.status && query.status.length > 0) {
    conditions.push({ status: { in: query.status } });
  }
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" } as const;
    conditions.push({
      OR: [
        { reflection: contains },
        { nextPlan: contains },
        {
          workEntries: {
            some: { visit: { OR: [{ content: contains }, { nextAction: contains }] } },
          },
        },
      ],
    });
  }
  return { AND: conditions };
};

// 一覧の項目は、日報ごとに問い合わせず、日報の一覧と一緒にまとめて読み込む
const select = {
  id: true,
  reportDate: true,
  status: true,
  user: { select: { id: true, name: true } },
  workEntries: { select: { category: true, minutes: true } },
  _count: { select: { comments: true } },
} as const satisfies Prisma.DailyReportSelect;

const toListItem = (
  report: Prisma.DailyReportGetPayload<{ select: typeof select }>,
): ReportListItem => ({
  id: report.id,
  report_date: toDateOnly(report.reportDate),
  user: report.user,
  status: report.status,
  visit_count: report.workEntries.filter((entry) => entry.category === "visit").length,
  total_minutes: report.workEntries.reduce((sum, entry) => sum + entry.minutes, 0),
  comment_count: report._count.comments,
});

/** 日報を検索し、日付の新しい順に1ページ分返す(同じ日付は登録の新しい順) */
export const searchReports = async (db: Db, viewer: Pick<User, "id" | "role">, query: Query) => {
  const where = reportSearchWhere(viewer, query);
  const [reports, total] = await db.$transaction([
    db.dailyReport.findMany({
      where,
      select,
      orderBy: [{ reportDate: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.per_page,
      take: query.per_page,
    }),
    db.dailyReport.count({ where }),
  ]);
  return {
    items: reports.map(toListItem),
    pagination: { page: query.page, per_page: query.per_page, total },
  };
};
