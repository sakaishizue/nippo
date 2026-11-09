import { z } from "zod";
import { dateSchema, dateTimeSchema } from "./datetime";
import { reportStatusSchema, reviewActionSchema, workCategorySchema } from "./enums";

// API仕様書 5章(日報)の出力

const refSchema = z.object({ id: z.number().int(), name: z.string() });

/** 訪問の詳細(作業区分が visit の作業だけにある) */
export const reportVisitSchema = z.object({
  id: z.number().int(),
  customer: refSchema,
  contact_name: z.string().nullable(),
  content: z.string().nullable(),
  next_action: z.string().nullable(),
});

export const reportWorkEntrySchema = z.object({
  id: z.number().int(),
  category: workCategorySchema,
  minutes: z.number().int(),
  deal: refSchema.nullable(),
  note: z.string().nullable(),
  visit: reportVisitSchema.nullable(),
});
export type ReportWorkEntry = z.infer<typeof reportWorkEntrySchema>;

export const reportReviewSchema = z.object({
  id: z.number().int(),
  reviewer: refSchema,
  action: reviewActionSchema,
  reason: z.string().nullable(),
  created_at: dateTimeSchema,
});

export const reportCommentSchema = z.object({
  id: z.number().int(),
  user: refSchema,
  body: z.string(),
  created_at: dateTimeSchema,
});
export type ReportComment = z.infer<typeof reportCommentSchema>;

/**
 * ログイン中のユーザーが、画面のボタンを出すかの判定に使う。実際の権限は各更新APIでも確かめる
 * - can_edit: 本人で、下書きか差し戻し
 * - can_review: 直属の上長で、提出済み
 * - can_comment: 本人か直属の上長(管理者は不可)
 */
export const reportPermissionsSchema = z.object({
  can_edit: z.boolean(),
  can_review: z.boolean(),
  can_comment: z.boolean(),
});
export type ReportPermissions = z.infer<typeof reportPermissionsSchema>;

/** GET /reports/{id} のレスポンス。作成、更新、提出、承認、差し戻しのレスポンスも同じ */
export const reportDetailSchema = z.object({
  id: z.number().int(),
  report_date: dateSchema,
  user: refSchema,
  status: reportStatusSchema,
  reflection: z.string().nullable(),
  next_plan: z.string().nullable(),
  // 最終提出日時。一度も提出していなければ null
  submitted_at: dateTimeSchema.nullable(),
  total_minutes: z.number().int(),
  work_entries: z.array(reportWorkEntrySchema),
  // 古い順
  reviews: z.array(reportReviewSchema),
  // 古い順
  comments: z.array(reportCommentSchema),
  permissions: reportPermissionsSchema,
});
export type ReportDetail = z.infer<typeof reportDetailSchema>;
