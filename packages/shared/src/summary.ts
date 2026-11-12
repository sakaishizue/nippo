import { z } from "zod";
import { dateSchema } from "./datetime";
import { workCategorySchema } from "./enums";

// API仕様書 6章(GET /work-time-summary)

export const SUMMARY_GROUPS = ["user", "customer", "deal", "category"] as const;
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];
export const summaryGroupSchema = z.enum(SUMMARY_GROUPS);
export const SUMMARY_GROUP_LABELS: Record<SummaryGroup, string> = {
  user: "担当者別",
  customer: "顧客別",
  deal: "商談別",
  category: "作業区分別",
};

/** `YYYY-MM-DD` の1年後の前日。期間はこの日まで(1年)にする */
export const lastDayOfYearFrom = (from: string): string => {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y + 1, m - 1, d));
  // 2月29日の1年後は3月1日になるため、前日の2月28日まで
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

/** クエリの値が1つなら文字列、複数なら配列で届くため、配列にそろえる */
const toArray = (value: unknown) => (value === undefined || Array.isArray(value) ? value : [value]);

/** GET /work-time-summary のクエリ */
export const workTimeSummaryQuerySchema = z
  .object({
    from: dateSchema,
    to: dateSchema,
    group_by: summaryGroupSchema,
    // 上長のみ。複数指定可。省略時は部下全員
    user_id: z.preprocess(toArray, z.array(z.coerce.number().int().positive())).optional(),
  })
  .check((ctx) => {
    const { from, to } = ctx.value;
    if (from > to) {
      ctx.issues.push({
        code: "custom",
        message: "期間の終了は開始以降の日付にしてください",
        path: ["to"],
        input: to,
      });
    } else if (to > lastDayOfYearFrom(from)) {
      ctx.issues.push({
        code: "custom",
        message: "期間は1年以内にしてください",
        path: ["to"],
        input: to,
      });
    }
  });
export type WorkTimeSummaryQuery = z.output<typeof workTimeSummaryQuerySchema>;

/** 集計の切り口の項目。作業区分別の ID は作業区分の値 */
const summaryKeySchema = z.object({
  id: z.union([z.number().int(), workCategorySchema]),
  name: z.string(),
});

/** GET /work-time-summary のレスポンス */
export const workTimeSummarySchema = z.object({
  group_by: summaryGroupSchema,
  total_minutes: z.number().int(),
  // 時間の多い順。key が null の行(未分類)は最後
  items: z.array(
    z.object({
      key: summaryKeySchema.nullable(),
      minutes: z.number().int(),
      ratio: z.number(),
    }),
  ),
});
export type WorkTimeSummary = z.infer<typeof workTimeSummarySchema>;
