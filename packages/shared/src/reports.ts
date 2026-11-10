import { z } from "zod";
import { dateSchema, dateTimeSchema } from "./datetime";
import { reportStatusSchema, reviewActionSchema, workCategorySchema } from "./enums";
import { paginationQuerySchema } from "./pagination";

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

// API仕様書 5章(日報)の入力。POST /reports と PUT /reports/{id} で同じ形

export const REPORT_TEXT_MAX_LENGTH = 2000;
export const WORK_NOTE_MAX_LENGTH = 500;
export const CONTACT_NAME_MAX_LENGTH = 100;
export const VISIT_TEXT_MAX_LENGTH = 2000;
/** 1日の作業時間の合計の上限(分) */
export const DAILY_MINUTES_MAX = 1440;

/** 空の文字列は「入力なし」として null にする */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, { error: `${label}は${max.toLocaleString("ja-JP")}文字以内で入力してください` })
    .nullish()
    .transform((value) => (value?.trim() ? value : null));

const idSchema = (message: string) =>
  z.number({ error: message }).int({ error: message }).positive({ error: message });

export const visitInputSchema = z.object({
  customer_id: idSchema("顧客を選択してください"),
  contact_name: optionalText(CONTACT_NAME_MAX_LENGTH, "面談相手"),
  // 下書きでは空でもよい。提出時に必須(POST /reports/{id}/submit)
  content: optionalText(VISIT_TEXT_MAX_LENGTH, "訪問内容"),
  next_action: optionalText(VISIT_TEXT_MAX_LENGTH, "次回アクション"),
});

export const workEntryInputSchema = z
  .object({
    category: workCategorySchema,
    minutes: z
      .number({ error: "1以上の整数を入力してください" })
      .int({ error: "1以上の整数を入力してください" })
      .min(1, { error: "1以上の整数を入力してください" }),
    deal_id: idSchema("商談を選択してください")
      .nullish()
      .transform((value) => value ?? null),
    note: optionalText(WORK_NOTE_MAX_LENGTH, "メモ"),
    visit: visitInputSchema.nullish().transform((value) => value ?? null),
  })
  .check((ctx) => {
    const { category, visit } = ctx.value;
    // 訪問の詳細は、作業区分が訪問の行だけに付ける(F-33)
    if (category === "visit" && visit === null) {
      ctx.issues.push({
        code: "custom",
        message: "訪問の詳細を入力してください",
        path: ["visit"],
        input: visit,
      });
    }
    if (category !== "visit" && visit !== null) {
      ctx.issues.push({
        code: "custom",
        message: "訪問以外の作業には、訪問の詳細を付けられません",
        path: ["visit"],
        input: visit,
      });
    }
  });
export type WorkEntryInput = z.input<typeof workEntryInputSchema>;

/**
 * POST /reports と PUT /reports/{id} のリクエスト。
 * 未来の日付と、訪問の商談の顧客が訪問先と一致するかは、API で確かめる(今日の日付とデータベースが必要なため)
 */
export const reportInputSchema = z
  .object({
    report_date: dateSchema,
    reflection: optionalText(REPORT_TEXT_MAX_LENGTH, "所感"),
    next_plan: optionalText(REPORT_TEXT_MAX_LENGTH, "翌日の予定"),
    // 下書きでは空でもよい
    work_entries: z.array(workEntryInputSchema).default([]),
  })
  .check((ctx) => {
    const total = ctx.value.work_entries.reduce((sum, entry) => sum + entry.minutes, 0);
    if (total > DAILY_MINUTES_MAX) {
      ctx.issues.push({
        code: "custom",
        message: `1日の作業時間の合計は${DAILY_MINUTES_MAX.toLocaleString("ja-JP")}分以下にしてください`,
        path: ["work_entries"],
        input: ctx.value.work_entries,
      });
    }
  });
export type ReportInput = z.input<typeof reportInputSchema>;
export type ReportInputData = z.output<typeof reportInputSchema>;

/** 提出時のチェックに使う日報の項目 */
export type SubmittableReport = {
  reflection: string | null;
  next_plan: string | null;
  work_entries: { category: string; visit: { content: string | null } | null }[];
};

const isBlank = (value: string | null | undefined) => !value?.trim();

/**
 * 提出時のチェック(API仕様書 POST /reports/{id}/submit、画面定義書 SCR-04)。
 * 作業が1件以上、訪問の行は訪問内容が入力済み、所感と翌日の予定が入力済み。違反がなければ空の配列
 */
export const reportSubmitIssues = (
  report: SubmittableReport,
): { field: string; message: string }[] => {
  const issues: { field: string; message: string }[] = [];
  if (report.work_entries.length === 0) {
    issues.push({ field: "work_entries", message: "作業を1件以上入力してください" });
  }
  report.work_entries.forEach((entry, index) => {
    if (entry.category === "visit" && isBlank(entry.visit?.content)) {
      issues.push({
        field: `work_entries[${index}].visit.content`,
        message: "訪問内容を入力してください",
      });
    }
  });
  if (isBlank(report.reflection)) {
    issues.push({ field: "reflection", message: "所感を入力してください" });
  }
  if (isBlank(report.next_plan)) {
    issues.push({ field: "next_plan", message: "翌日の予定を入力してください" });
  }
  return issues;
};

/** クエリの値が1つなら文字列、複数なら配列で届くため、配列にそろえる */
const toArray = (value: unknown) => (value === undefined || Array.isArray(value) ? value : [value]);

/** GET /reports のクエリ */
export const reportListQuerySchema = paginationQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  // 担当者。一般が指定した場合は無視する
  user_id: z.coerce.number().int().positive().optional(),
  // 訪問記録の顧客
  customer_id: z.coerce.number().int().positive().optional(),
  // 複数指定可(例: `status=submitted&status=returned`)
  status: z.preprocess(toArray, z.array(reportStatusSchema)).optional(),
  // 所感、翌日の予定、訪問内容、次回アクションの部分一致
  q: z.string().trim().optional(),
});

/** GET /reports の1件分 */
export const reportListItemSchema = z.object({
  id: z.number().int(),
  report_date: dateSchema,
  user: refSchema,
  status: reportStatusSchema,
  visit_count: z.number().int(),
  total_minutes: z.number().int(),
  comment_count: z.number().int(),
});
export type ReportListItem = z.infer<typeof reportListItemSchema>;
