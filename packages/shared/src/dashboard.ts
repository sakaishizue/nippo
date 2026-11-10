import { z } from "zod";
import { dateSchema } from "./datetime";
import { reportStatusSchema } from "./enums";

// API仕様書 4章(GET /dashboard)。ロールによって内容が違う

/** 一般のホーム(画面定義書 SCR-02) */
export const memberDashboardSchema = z.object({
  // 今日(日本時間)の日報。未作成なら null
  today_report: z
    .object({ id: z.number().int(), report_date: dateSchema, status: reportStatusSchema })
    .nullable(),
  // 差し戻し中の日報と、最新の差し戻し理由。日付の新しい順
  returned_reports: z.array(
    z.object({ id: z.number().int(), report_date: dateSchema, reason: z.string().nullable() }),
  ),
  // 直近7日分(今日を含む)の日報。日付の新しい順
  recent_reports: z.array(
    z.object({
      id: z.number().int(),
      report_date: dateSchema,
      status: reportStatusSchema,
      total_minutes: z.number().int(),
    }),
  ),
});
export type MemberDashboard = z.infer<typeof memberDashboardSchema>;

/** 部下の日報の提出状況。日報がない、または下書き(上長には見せない)なら null(未提出) */
const subordinateReportSchema = z
  .object({ report_id: z.number().int(), status: reportStatusSchema })
  .nullable();

/** 上長のホーム(画面定義書 SCR-02) */
export const managerDashboardSchema = z.object({
  // 承認待ち(直属の部下の提出済みの日報)の件数
  pending_count: z.number().int(),
  // 有効な直属の部下ごとの、前営業日と今日の日報
  subordinates: z.array(
    z.object({
      user: z.object({ id: z.number().int(), name: z.string() }),
      previous_business_day: subordinateReportSchema,
      today: subordinateReportSchema,
    }),
  ),
});
export type ManagerDashboard = z.infer<typeof managerDashboardSchema>;
