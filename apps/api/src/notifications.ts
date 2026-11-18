import type { NotificationType, ReportStatus } from "@nippo/shared";
import type { Prisma } from "../generated/prisma/client";
import { now } from "./clock";
import type { Db } from "./db";

// 通知の作成(要件定義書 4.6、F-51〜54)。通知先のルールと通知文をここにまとめる

type Person = { id: number; name: string };

/** 通知のきっかけになった日報 */
export type NotifiedReport = {
  id: number;
  /** 日報の日付(`YYYY-MM-DD`) */
  reportDate: string;
  status: ReportStatus;
  /** 日報の作成者と、その上長(上長がいなければ null) */
  author: Person & { managerId: number | null };
};

export type NotificationEvent =
  /** 提出された(F-51)。上長に通知する */
  | { type: "submitted"; report: NotifiedReport }
  /** 承認、差し戻しされた(F-52)。作成者に通知する */
  | { type: "approved" | "returned"; report: NotifiedReport }
  /** コメントが付いた(F-53)。作成者と上長のうち、投稿者以外に通知する */
  | { type: "commented"; report: NotifiedReport; commenter: Person }
  /**
   * 前営業日の日報が未提出(F-54)。本人に通知する。
   * 日報を作っていない場合もあるため、日報のIDは null でもよい
   */
  | { type: "reminder"; userId: number; reportDate: string; reportId: number | null };

/** 「山田 太郎」から「山田」を取り出す。姓と名の間に空白がなければ、氏名のままにする */
export const familyNameOf = (name: string): string => name.trim().split(/[\s　]+/)[0] ?? name;

/** `2026-11-06` を「11月6日」にする(通知文は年を省く。画面定義書 SCR-14) */
export const monthDayOf = (date: string): string => {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
};

/** 通知先のユーザーのID。同じ人には1件だけ通知する */
export const notificationRecipients = (event: NotificationEvent): number[] => {
  switch (event.type) {
    case "submitted": {
      const { managerId } = event.report.author;
      return managerId === null ? [] : [managerId];
    }
    case "approved":
    case "returned":
      return [event.report.author.id];
    case "commented": {
      const { author, status } = event.report;
      // 下書きは上長が閲覧できないため、上長には通知しない(API仕様書 POST /reports/{id}/comments)
      const candidates = [
        author.id,
        ...(status !== "draft" && author.managerId !== null ? [author.managerId] : []),
      ];
      return [...new Set(candidates)].filter((id) => id !== event.commenter.id);
    }
    case "reminder":
      return [event.userId];
  }
};

/** 通知文(画面定義書 SCR-14 の例に合わせる) */
export const notificationMessage = (event: NotificationEvent): string => {
  switch (event.type) {
    case "submitted":
      return `${familyNameOf(event.report.author.name)}さんが${monthDayOf(event.report.reportDate)}の日報を提出しました`;
    case "approved":
      return `${monthDayOf(event.report.reportDate)}の日報が承認されました`;
    case "returned":
      return `${monthDayOf(event.report.reportDate)}の日報が差し戻されました`;
    case "commented":
      return `${monthDayOf(event.report.reportDate)}の日報に${familyNameOf(event.commenter.name)}さんがコメントしました`;
    case "reminder":
      return `${monthDayOf(event.reportDate)}の日報が未提出です`;
  }
};

const reportIdOf = (event: NotificationEvent): number | null =>
  event.type === "reminder" ? event.reportId : event.report.id;

/**
 * 通知を作る。日報の状態の変更と同じトランザクションで呼ぶ(`db.$transaction(async (tx) => ...)` の tx を渡す)。
 * 状態の変更が失敗したら、通知も作られない。作った通知の件数を返す(作り済みのリマインドは数えない)
 */
export const createNotifications = async (
  db: Db | Prisma.TransactionClient,
  event: NotificationEvent,
): Promise<number> => {
  const recipients = notificationRecipients(event);
  if (recipients.length === 0) return 0;
  const type: NotificationType = event.type;
  const message = notificationMessage(event);
  const reportId = reportIdOf(event);
  // リマインドは対象の日を持つ。同じ人に同じ日のリマインドは1件だけ(一意の制約で、作ろうとしても作らない)
  const targetDate = event.type === "reminder" ? new Date(`${event.reportDate}T00:00:00Z`) : null;
  const createdAt = now();
  const { count } = await db.notification.createMany({
    data: recipients.map((userId) => ({ userId, reportId, type, message, targetDate, createdAt })),
    skipDuplicates: true,
  });
  return count;
};

/** 用件が片付いた通知を既読にするきっかけ */
export type ResolveEvent =
  /** 日報を承認、差し戻しした。上長宛ての提出の通知が片付く */
  | { type: "reviewed"; reportId: number }
  /** 日報を提出(再提出)した。本人宛ての差し戻しの通知と、対象日のリマインドが片付く */
  | { type: "submitted"; reportId: number; userId: number; reportDate: string };

/** 片付いた通知の条件(未読のものだけ) */
export const resolvedNotificationsWhere = (event: ResolveEvent): Prisma.NotificationWhereInput => {
  switch (event.type) {
    case "reviewed":
      return { readAt: null, reportId: event.reportId, type: "submitted" };
    case "submitted":
      return {
        readAt: null,
        OR: [
          { reportId: event.reportId, type: "returned" },
          // 日報を作る前に届いたリマインドは日報のIDを持たないため、対象日で照合する
          {
            userId: event.userId,
            type: "reminder",
            targetDate: new Date(`${event.reportDate}T00:00:00Z`),
          },
        ],
      };
  }
};

/**
 * 用件が片付いた未読の通知を既読にする(要件定義書 4.6)。一覧には残り、未読の件数からは外れる。
 * 日報の状態の変更と同じトランザクションで呼ぶ。既読にした件数を返す
 */
export const resolveNotifications = async (
  db: Db | Prisma.TransactionClient,
  event: ResolveEvent,
): Promise<number> => {
  const { count } = await db.notification.updateMany({
    where: resolvedNotificationsWhere(event),
    data: { readAt: now() },
  });
  return count;
};
