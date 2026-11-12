import type { NotificationResponse } from "@nippo/shared";

/**
 * 通知を選んだときに開く画面(画面定義書 SCR-14)。
 * - リマインド: 対象日の日報入力。日報があれば編集、なければ対象日で新規作成
 * - それ以外: 対象の日報の詳細
 * 開く画面がない場合は null
 */
export const notificationTarget = (
  notification: Pick<NotificationResponse, "type" | "report_id" | "target_date">,
): string | null => {
  if (notification.type === "reminder") {
    if (notification.report_id !== null) return `/reports/${notification.report_id}/edit`;
    return notification.target_date
      ? `/reports/new?date=${notification.target_date}`
      : "/reports/new";
  }
  return notification.report_id === null ? null : `/reports/${notification.report_id}`;
};
