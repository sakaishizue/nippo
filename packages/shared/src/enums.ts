import { z } from "zod";

// API仕様書 1.7 の列挙値。値の配列、Zod スキーマ、画面に出す日本語ラベルをそろえて定義する

export const ROLES = ["member", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);
export const ROLE_LABELS: Record<Role, string> = {
  member: "一般",
  manager: "上長",
  admin: "管理者",
};

export const REPORT_STATUSES = ["draft", "submitted", "returned", "approved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "下書き",
  submitted: "提出済み",
  returned: "差し戻し",
  approved: "承認済み",
};

export const WORK_CATEGORIES = ["visit", "travel", "document", "meeting", "other"] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];
export const workCategorySchema = z.enum(WORK_CATEGORIES);
export const WORK_CATEGORY_LABELS: Record<WorkCategory, string> = {
  visit: "訪問",
  travel: "移動",
  document: "資料作成",
  meeting: "社内会議",
  other: "その他",
};

export const DEAL_STAGES = ["lead", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
export const dealStageSchema = z.enum(DEAL_STAGES);
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  lead: "見込み",
  proposal: "提案中",
  negotiation: "交渉中",
  won: "受注",
  lost: "失注",
};

export const REVIEW_ACTIONS = ["approved", "returned"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const reviewActionSchema = z.enum(REVIEW_ACTIONS);
export const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  approved: "承認",
  returned: "差し戻し",
};

export const NOTIFICATION_TYPES = [
  "submitted",
  "approved",
  "returned",
  "commented",
  "reminder",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  submitted: "提出",
  approved: "承認",
  returned: "差し戻し",
  commented: "コメント",
  reminder: "リマインド",
};
