import { z } from "zod";
import { dateTimeSchema } from "./datetime";
import { notificationTypeSchema } from "./enums";

// API仕様書 9章(通知)

/** GET /notifications の1件分 */
export const notificationSchema = z.object({
  id: z.number().int(),
  type: notificationTypeSchema,
  message: z.string(),
  // 対象の日報。日報を作っていない日のリマインドは null
  report_id: z.number().int().nullable(),
  // 既読日時。未読は null
  read_at: dateTimeSchema.nullable(),
  created_at: dateTimeSchema,
});
export type NotificationResponse = z.infer<typeof notificationSchema>;
