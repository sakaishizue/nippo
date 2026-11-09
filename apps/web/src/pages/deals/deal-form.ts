import {
  DEAL_AMOUNT_MAX,
  DEAL_NAME_MAX_LENGTH,
  type DealDetailResponse,
  type DealInput,
  dealStageSchema,
} from "@nippo/shared";
import { z } from "zod";

// SCR-13 商談登録・編集の入力。数値と日付の欄は文字列で持ち、送るときに API の形にする

const optionSchema = z.object({ id: z.number().int(), name: z.string() });

export const dealFormSchema = z.object({
  customer: optionSchema.nullable().refine((value) => value !== null, {
    error: "顧客を選択してください",
  }),
  name: z
    .string()
    .trim()
    .min(1, { error: "商談名を入力してください" })
    .max(DEAL_NAME_MAX_LENGTH, {
      error: `商談名は${DEAL_NAME_MAX_LENGTH}文字以内で入力してください`,
    }),
  owner_id: z.string().min(1, { error: "担当者を選択してください" }),
  stage: dealStageSchema,
  // 3桁区切りのカンマは入力してもよい
  amount: z
    .string()
    .transform((value) => value.replaceAll(",", "").trim())
    .refine((value) => value === "" || /^\d+$/.test(value), {
      error: "見込金額は0以上の整数で入力してください",
    })
    .refine((value) => value === "" || Number(value) <= DEAL_AMOUNT_MAX, {
      error: `見込金額は${DEAL_AMOUNT_MAX.toLocaleString("ja-JP")}以下で入力してください`,
    }),
  expected_close_date: z.string(),
});

export type DealFormInput = z.input<typeof dealFormSchema>;
export type DealFormOutput = z.output<typeof dealFormSchema>;

/** 入力欄の初期値。登録は、指定された顧客と担当者(一般なら自分)を選んでおく */
export const dealFormDefaults = (
  deal: DealDetailResponse | undefined,
  defaults: { customer?: { id: number; name: string } | null; ownerId?: number | null } = {},
): DealFormInput => ({
  customer: deal?.customer ?? defaults.customer ?? null,
  name: deal?.name ?? "",
  owner_id: String(deal?.owner.id ?? defaults.ownerId ?? ""),
  stage: deal?.stage ?? "lead",
  amount: deal?.amount === null || deal?.amount === undefined ? "" : String(deal.amount),
  expected_close_date: deal?.expected_close_date ?? "",
});

/** POST /deals と PUT /deals/{id} のリクエスト。空の見込金額と受注予定日は null */
export const toDealRequest = (values: DealFormOutput): DealInput => ({
  customer_id: values.customer?.id ?? 0,
  name: values.name,
  owner_id: Number(values.owner_id),
  stage: values.stage,
  amount: values.amount === "" ? null : Number(values.amount),
  expected_close_date: values.expected_close_date === "" ? null : values.expected_close_date,
});
