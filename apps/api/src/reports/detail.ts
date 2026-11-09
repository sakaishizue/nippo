import { type ReportDetail, toJstDateTimeString } from "@nippo/shared";
import type { Prisma, User } from "../../generated/prisma/client";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { reportPermissions, visibleReportsWhere } from "./access";

const ref = { select: { id: true, name: true } } as const;

const include = {
  user: { select: { id: true, name: true, managerId: true } },
  workEntries: {
    include: {
      deal: ref,
      visit: { include: { customer: ref } },
    },
    orderBy: { id: "asc" },
  },
  reviews: { include: { reviewer: ref }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  comments: { include: { user: ref }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} as const satisfies Prisma.DailyReportInclude;

type ReportRow = Prisma.DailyReportGetPayload<{ include: typeof include }>;

const toReportDetail = (report: ReportRow, viewer: Pick<User, "id" | "role">): ReportDetail => ({
  id: report.id,
  report_date: toDateOnly(report.reportDate),
  user: { id: report.user.id, name: report.user.name },
  status: report.status,
  reflection: report.reflection,
  next_plan: report.nextPlan,
  submitted_at: report.submittedAt ? toJstDateTimeString(report.submittedAt) : null,
  total_minutes: report.workEntries.reduce((sum, entry) => sum + entry.minutes, 0),
  work_entries: report.workEntries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    minutes: entry.minutes,
    deal: entry.deal,
    note: entry.note,
    visit: entry.visit
      ? {
          id: entry.visit.id,
          customer: entry.visit.customer,
          contact_name: entry.visit.contactName,
          content: entry.visit.content,
          next_action: entry.visit.nextAction,
        }
      : null,
  })),
  reviews: report.reviews.map((review) => ({
    id: review.id,
    reviewer: review.reviewer,
    action: review.action,
    reason: review.reason,
    created_at: toJstDateTimeString(review.createdAt),
  })),
  comments: report.comments.map((comment) => ({
    id: comment.id,
    user: comment.user,
    body: comment.body,
    created_at: toJstDateTimeString(comment.createdAt),
  })),
  permissions: reportPermissions(viewer, {
    userId: report.userId,
    status: report.status,
    managerId: report.user.managerId,
  }),
});

/**
 * 閲覧できる日報の詳細を返す。存在しない、または閲覧範囲の外なら null(API は 404 にして、存在を知られないようにする)
 * @param db トランザクションの中でも使えるように、tx も受け取る
 */
export const findReportDetail = async (
  db: Db | Prisma.TransactionClient,
  id: number,
  viewer: Pick<User, "id" | "role">,
): Promise<ReportDetail | null> => {
  const report = await db.dailyReport.findFirst({
    where: { AND: [{ id }, visibleReportsWhere(viewer)] },
    include,
  });
  return report ? toReportDetail(report, viewer) : null;
};
