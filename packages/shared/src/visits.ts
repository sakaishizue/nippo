import { z } from "zod";
import { dateSchema } from "./datetime";

// API仕様書 7章、8章の訪問履歴。訪問記録だけを全員に共有し、作業時間、所感、翌日の予定、コメントは返さない(要件定義書 2章)

const refSchema = z.object({ id: z.number().int(), name: z.string() });

const visitHistoryBase = z.object({
  visit_id: z.number().int(),
  // 日報の日付
  visited_on: dateSchema,
  visitor: refSchema,
  contact_name: z.string().nullable(),
  content: z.string().nullable(),
  next_action: z.string().nullable(),
});

/** GET /customers/{id}/visits の1件分。訪問の商談(作業に紐づく商談。なければ null)を返す */
export const customerVisitSchema = visitHistoryBase.extend({
  deal: refSchema.nullable(),
});
export type CustomerVisit = z.infer<typeof customerVisitSchema>;

/** GET /deals/{id}/visits の1件分。商談の代わりに訪問先の顧客を返す */
export const dealVisitSchema = visitHistoryBase.extend({
  customer: refSchema,
});
export type DealVisit = z.infer<typeof dealVisitSchema>;
