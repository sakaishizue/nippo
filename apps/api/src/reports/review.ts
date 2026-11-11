import {
  type PaginationQuery,
  PENDING_OVERDUE_HOURS,
  type PendingReport,
  type ReviewAction,
  toJstDateTimeString,
} from "@nippo/shared";
import type { Prisma, User } from "../../generated/prisma/client";
import { now } from "../clock";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { AppError } from "../errors";
import { createNotifications } from "../notifications";
import { visibleReportsWhere } from "./access";

// 承認と差し戻し(F-41〜43、F-52)、承認待ちの一覧(F-45)

const notSubmitted = () =>
  new AppError("INVALID_STATUS", "提出済みの日報だけを承認、差し戻しできます");

/**
 * 日報を承認または差し戻す。承認履歴と作成者への通知を、ステータスの更新と同じトランザクションで作る。
 * 閲覧範囲の外(部下以外、下書き)は null を返す(呼び出し側で 404 にする)
 */
export const reviewReport = async (
  db: Db,
  reviewer: Pick<User, "id" | "role">,
  id: number,
  action: ReviewAction,
  reason: string | null,
): Promise<boolean> => {
  // 上長の閲覧範囲は、直属の部下の提出済み以降の日報(REV-05、REV-06)
  const report = await db.dailyReport.findFirst({
    where: { AND: [{ id }, visibleReportsWhere(reviewer)] },
    select: {
      reportDate: true,
      status: true,
      user: { select: { id: true, name: true, managerId: true } },
    },
  });
  if (!report) return false;
  if (report.status !== "submitted") throw notSubmitted();

  await db.$transaction(async (tx) => {
    // 確かめてから更新するまでに、別の操作(承認と差し戻しの同時操作など)で処理された場合に備え、
    // ステータスを条件にして1回で更新する。先に処理されていれば 409(REV-08)
    const { count } = await tx.dailyReport.updateMany({
      where: { id, status: "submitted" },
      data: { status: action },
    });
    if (count === 0) throw notSubmitted();
    await tx.reportReview.create({
      data: { reportId: id, reviewerId: reviewer.id, action, reason, createdAt: now() },
    });
    await createNotifications(tx, {
      type: action,
      report: {
        id,
        reportDate: toDateOnly(report.reportDate),
        status: action,
        author: report.user,
      },
    });
  });
  return true;
};

const OVERDUE_MS = PENDING_OVERDUE_HOURS * 60 * 60 * 1000;

const pendingSelect = {
  id: true,
  reportDate: true,
  submittedAt: true,
  user: { select: { id: true, name: true } },
  workEntries: { select: { category: true, minutes: true } },
} as const satisfies Prisma.DailyReportSelect;

/** 直属の部下の提出済みの日報を、提出日時の古い順に1ページ分返す(GET /reports/pending) */
export const findPendingReports = async (
  db: Db,
  manager: Pick<User, "id">,
  query: PaginationQuery,
) => {
  const where = {
    user: { managerId: manager.id },
    status: "submitted",
  } satisfies Prisma.DailyReportWhereInput;
  const [reports, total] = await db.$transaction([
    db.dailyReport.findMany({
      where,
      select: pendingSelect,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.per_page,
      take: query.per_page,
    }),
    db.dailyReport.count({ where }),
  ]);
  const current = now().getTime();
  const items = reports.map((report): PendingReport => {
    // 提出済みには提出日時が必ずある。念のため、ない場合は今の日時として扱う
    const submittedAt = report.submittedAt ?? now();
    return {
      id: report.id,
      report_date: toDateOnly(report.reportDate),
      user: report.user,
      submitted_at: toJstDateTimeString(submittedAt),
      is_overdue: current - submittedAt.getTime() >= OVERDUE_MS,
      visit_count: report.workEntries.filter((entry) => entry.category === "visit").length,
      total_minutes: report.workEntries.reduce((sum, entry) => sum + entry.minutes, 0),
    };
  });
  return { items, pagination: { page: query.page, per_page: query.per_page, total } };
};
