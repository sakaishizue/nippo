import type { CustomerVisit, DealVisit } from "@nippo/shared";
import type { Prisma } from "../generated/prisma/client";
import { toDateOnly } from "./dates";
import type { Db } from "./db";

/** 訪問履歴に出すのは、提出済みと承認済みの日報の訪問だけ(F-24) */
const SHARED_STATUSES = ["submitted", "approved"] as const;

// 作業時間、所感、翌日の予定、コメントは読み込まない(要件定義書 2章)
const select = {
  id: true,
  contactName: true,
  content: true,
  nextAction: true,
  customer: { select: { id: true, name: true } },
  workEntry: {
    select: {
      deal: { select: { id: true, name: true } },
      report: { select: { reportDate: true, user: { select: { id: true, name: true } } } },
    },
  },
} as const satisfies Prisma.VisitSelect;

type VisitRow = Prisma.VisitGetPayload<{ select: typeof select }>;

const toBase = (visit: VisitRow) => ({
  visit_id: visit.id,
  visited_on: toDateOnly(visit.workEntry.report.reportDate),
  visitor: visit.workEntry.report.user,
  contact_name: visit.contactName,
  content: visit.content,
  next_action: visit.nextAction,
});

export const toCustomerVisit = (visit: VisitRow): CustomerVisit => ({
  ...toBase(visit),
  deal: visit.workEntry.deal,
});

export const toDealVisit = (visit: VisitRow): DealVisit => ({
  ...toBase(visit),
  customer: visit.customer,
});

/**
 * 顧客(訪問先)または商談(作業に紐づく商談)の訪問履歴を、訪問日の新しい順に1ページ分返す。
 * 同じ日の訪問は、登録の新しい順
 */
export const findVisitHistory = async (
  db: Db,
  target: { customerId: number } | { dealId: number },
  { page, per_page }: { page: number; per_page: number },
) => {
  const shared = { status: { in: [...SHARED_STATUSES] } };
  const condition: Prisma.VisitWhereInput =
    "customerId" in target
      ? { customerId: target.customerId, workEntry: { report: shared } }
      : { workEntry: { dealId: target.dealId, report: shared } };
  const [visits, total] = await db.$transaction([
    db.visit.findMany({
      where: condition,
      select,
      orderBy: [{ workEntry: { report: { reportDate: "desc" } } }, { id: "desc" }],
      skip: (page - 1) * per_page,
      take: per_page,
    }),
    db.visit.count({ where: condition }),
  ]);
  return { visits, pagination: { page, per_page, total } };
};
