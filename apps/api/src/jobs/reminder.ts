import { todayInJst } from "@nippo/shared";
import { isBusinessDay, previousBusinessDay } from "../business-day";
import type { Db } from "../db";
import { createNotifications } from "../notifications";

// 未提出のリマインド(要件定義書 F-54)。平日の朝9時に Cloud Scheduler から Cloud Run ジョブとして起動する

/** 提出していないとみなすステータス。差し戻し中も、直して再提出するまでは未提出とする */
const UNSUBMITTED = ["draft", "returned"] as const;

export type ReminderResult =
  /** 実行日が休日のため、何もしなかった */
  { skipped: "holiday"; today: string } | { today: string; targetDate: string; created: number };

/**
 * 実行日(日本時間)の前営業日の日報が未提出(日報がない、下書き、差し戻し中)の、有効な一般のユーザーに
 * リマインドの通知を作る。月曜日は金曜日の日報が対象。
 * 同じ日に何度実行しても、同じ人への同じ日のリマインドは1件だけ(RMD-07)
 */
export const runReminders = async (db: Db, at: Date): Promise<ReminderResult> => {
  const today = todayInJst(at);
  if (!isBusinessDay(today)) return { skipped: "holiday", today };
  const targetDate = previousBusinessDay(today);

  const members = await db.user.findMany({
    where: { role: "member", isActive: true },
    select: {
      id: true,
      reports: {
        where: { reportDate: new Date(`${targetDate}T00:00:00Z`) },
        select: { id: true, status: true },
      },
    },
    orderBy: { id: "asc" },
  });

  let created = 0;
  for (const member of members) {
    const report = member.reports[0] ?? null;
    if (report && !(UNSUBMITTED as readonly string[]).includes(report.status)) continue;
    created += await createNotifications(db, {
      type: "reminder",
      userId: member.id,
      reportDate: targetDate,
      reportId: report?.id ?? null,
    });
  }
  return { today, targetDate, created };
};
