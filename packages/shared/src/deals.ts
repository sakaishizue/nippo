import { z } from "zod";
import { dateSchema } from "./datetime";
import { dealStageSchema } from "./enums";
import { paginationQuerySchema } from "./pagination";

// API仕様書 8章(商談)の入力と出力

export const DEAL_NAME_MAX_LENGTH = 100;
/** 見込金額の上限(円)。データベースの整数の上限(約21億円) */
export const DEAL_AMOUNT_MAX = 2_147_483_647;

const idSchema = (message: string) =>
  z.number({ error: message }).int({ error: message }).positive({ error: message });

/** POST /deals と PUT /deals/{id} のリクエスト */
export const dealInputSchema = z.object({
  customer_id: idSchema("顧客を選択してください"),
  name: z
    .string()
    .trim()
    .min(1, { error: "商談名を入力してください" })
    .max(DEAL_NAME_MAX_LENGTH, {
      error: `商談名は${DEAL_NAME_MAX_LENGTH}文字以内で入力してください`,
    }),
  owner_id: idSchema("担当者を選択してください"),
  stage: dealStageSchema,
  // 見込金額(円)。省略や null は未入力
  amount: z
    .number()
    .int({ error: "見込金額は整数で入力してください" })
    .min(0, { error: "見込金額は0以上で入力してください" })
    .max(DEAL_AMOUNT_MAX, {
      error: `見込金額は${DEAL_AMOUNT_MAX.toLocaleString("ja-JP")}以下で入力してください`,
    })
    .nullish()
    .transform((value) => value ?? null),
  expected_close_date: dateSchema.nullish().transform((value) => value ?? null),
});
export type DealInput = z.input<typeof dealInputSchema>;

/** クエリの値が1つなら文字列、複数なら配列で届くため、配列にそろえる */
const toArray = (value: unknown) => (value === undefined || Array.isArray(value) ? value : [value]);

/** GET /deals のクエリ */
export const dealListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  owner_id: z.coerce.number().int().positive().optional(),
  // 複数指定可(例: `stage=lead&stage=proposal`)
  stage: z.preprocess(toArray, z.array(dealStageSchema)).optional(),
});

const refSchema = z.object({ id: z.number().int(), name: z.string() });

/** GET /deals の1件分 */
export const dealSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  customer: refSchema,
  owner: refSchema,
  stage: dealStageSchema,
  amount: z.number().int().nullable(),
  expected_close_date: dateSchema.nullable(),
});
export type DealResponse = z.infer<typeof dealSchema>;

/**
 * GET /deals/{id}、POST /deals、PUT /deals/{id} のレスポンス。
 * has_visits は訪問記録(下書きの日報を含む)があれば true。あれば顧客を変更できない(画面定義書 SCR-13)
 */
export const dealDetailSchema = dealSchema.extend({
  has_visits: z.boolean(),
});
export type DealDetailResponse = z.infer<typeof dealDetailSchema>;
