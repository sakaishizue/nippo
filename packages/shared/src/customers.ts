import { z } from "zod";
import { dateSchema } from "./datetime";
import { dealStageSchema } from "./enums";
import { paginationQuerySchema } from "./pagination";

// API仕様書 7章(顧客)の入力と出力

export const CUSTOMER_NAME_MAX_LENGTH = 100;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 200;
export const CUSTOMER_PHONE_MAX_LENGTH = 20;

/** 空の文字列は「入力なし」として null にする */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .nullish()
    .transform((value) => (value ? value : null));

/** POST /customers と PUT /customers/{id} のリクエスト */
export const customerInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "顧客名を入力してください" })
    .max(CUSTOMER_NAME_MAX_LENGTH, {
      error: `顧客名は${CUSTOMER_NAME_MAX_LENGTH}文字以内で入力してください`,
    }),
  address: optionalText(
    CUSTOMER_ADDRESS_MAX_LENGTH,
    `住所は${CUSTOMER_ADDRESS_MAX_LENGTH}文字以内で入力してください`,
  ),
  phone: optionalText(
    CUSTOMER_PHONE_MAX_LENGTH,
    `電話番号は${CUSTOMER_PHONE_MAX_LENGTH}文字以内で入力してください`,
  ).refine((value) => value === null || /^[0-9-]+$/.test(value), {
    error: "電話番号は数字とハイフンで入力してください",
  }),
  // true なら、同じ名前の顧客があっても登録する(画面定義書 SCR-10 の確認後)
  confirm_duplicate: z.boolean().default(false),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

/** GET /customers のクエリ */
export const customerListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
});

/** GET /customers の1件分 */
export const customerListItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  deal_count: z.number().int().min(0),
  // 提出済みと承認済みの日報の訪問のうち、最新の訪問日。訪問がなければ null
  last_visited_on: dateSchema.nullable(),
});
export type CustomerListItem = z.infer<typeof customerListItemSchema>;

const userRefSchema = z.object({ id: z.number().int(), name: z.string() });

/** GET /customers/{id} の商談の1件分 */
export const customerDealSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  owner: userRefSchema,
  stage: dealStageSchema,
  amount: z.number().int().nullable(),
  expected_close_date: dateSchema.nullable(),
});

/** GET /customers/{id}、POST /customers、PUT /customers/{id} のレスポンス */
export const customerDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  deals: z.array(customerDealSchema),
});
export type CustomerDetail = z.infer<typeof customerDetailSchema>;
