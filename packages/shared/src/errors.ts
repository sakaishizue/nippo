import { z } from "zod";

// API仕様書 1.6 のエラーコードと、対応するステータスコード
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  INVALID_STATUS: 409,
  REPORT_ALREADY_EXISTS: 409,
  DUPLICATE_CUSTOMER_NAME: 409,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    // VALIDATION_ERROR のときの項目ごとの内容
    details: z.array(errorDetailSchema).optional(),
    // REPORT_ALREADY_EXISTS のときの既存の日報のID
    existing_report_id: z.number().int().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
