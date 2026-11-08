import { describe, expect, test } from "vitest";
import { ERROR_CODES, ERROR_STATUS, errorResponseSchema } from "./errors";

describe("API仕様書 1.6 のエラーコード", () => {
  test("エラーコードとステータスコードの対応", () => {
    expect(ERROR_STATUS).toEqual({
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
    });
    expect(ERROR_CODES).toHaveLength(10);
  });
});

describe("errorResponseSchema", () => {
  test("API仕様書 1.6 の例を受け付ける", () => {
    const result = errorResponseSchema.safeParse({
      error: {
        code: "VALIDATION_ERROR",
        message: "入力内容に誤りがあります",
        details: [{ field: "work_entries[0].minutes", message: "1以上の整数を入力してください" }],
      },
    });
    expect(result.success).toBe(true);
  });

  test("既存の日報のIDを含む REPORT_ALREADY_EXISTS を受け付ける", () => {
    const result = errorResponseSchema.safeParse({
      error: {
        code: "REPORT_ALREADY_EXISTS",
        message: "同じ日付の日報があります",
        existing_report_id: 98,
      },
    });
    expect(result.success).toBe(true);
  });

  test("定義されていないエラーコードは受け付けない", () => {
    const result = errorResponseSchema.safeParse({
      error: { code: "TEAPOT", message: "x" },
    });
    expect(result.success).toBe(false);
  });
});
