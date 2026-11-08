import type { Role } from "@nippo/shared";

export type MenuItem = {
  label: string;
  to: string;
  /** そのURLだけで選択中にする(ホームが他の画面で選択中にならないように) */
  end?: boolean;
};

const HOME: MenuItem = { label: "ホーム", to: "/", end: true };
const APPROVALS: MenuItem = { label: "承認待ち", to: "/approvals" };
const REPORTS: MenuItem = { label: "日報一覧", to: "/reports" };
const SUMMARY: MenuItem = { label: "作業時間集計", to: "/summary" };
const CUSTOMERS: MenuItem = { label: "顧客", to: "/customers" };
const DEALS: MenuItem = { label: "商談", to: "/deals" };
const USERS: MenuItem = { label: "ユーザー管理", to: "/admin/users" };

/** ロールごとのメニュー(画面定義書 3.1) */
export const MENUS: Record<Role, readonly MenuItem[]> = {
  member: [HOME, REPORTS, SUMMARY, CUSTOMERS, DEALS],
  manager: [HOME, APPROVALS, REPORTS, SUMMARY, CUSTOMERS, DEALS],
  admin: [USERS, REPORTS, CUSTOMERS, DEALS],
};

/** 通知を表示するか。管理者には通知が発生しないため表示しない(画面定義書 1章) */
export const showsNotifications = (role: Role): boolean => role !== "admin";

/** 未読数のバッジの表示。100件以上は「99+」にする */
export const badgeLabel = (count: number): string | null => {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
};
