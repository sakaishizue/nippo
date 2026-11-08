import { ERROR_STATUS, type ErrorCode, type ErrorDetail, type ErrorResponse } from "@nippo/shared";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { log } from "./logger";

type ErrorBody = ErrorResponse["error"];

/** API仕様書 1.6 の形式で返すアプリのエラー。ステータスコードはエラーコードから決まる */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;
  readonly extra: Omit<ErrorBody, "code" | "message" | "details">;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ErrorDetail[]; extra?: AppError["extra"] } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.extra = options.extra ?? {};
  }

  get status(): ContentfulStatusCode {
    return ERROR_STATUS[this.code];
  }
}

const respond = (c: Context, status: ContentfulStatusCode, error: ErrorBody) =>
  c.json({ error } satisfies ErrorResponse, status);

// Hono が投げる HTTPException(不正な JSON など)を、API仕様書のエラーコードに変換する
const HTTP_EXCEPTION_CODES: Partial<Record<number, ErrorCode>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
};

export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return respond(c, err.status, {
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
      ...err.extra,
    });
  }
  if (err instanceof HTTPException) {
    const code = HTTP_EXCEPTION_CODES[err.status];
    if (code) return respond(c, ERROR_STATUS[code], { code, message: err.message });
  }
  // 想定外のエラーは詳細をレスポンスに含めず、ログにだけ出す
  log("ERROR", err.message, { requestId: c.get("requestId"), stack: err.stack });
  return respond(c, ERROR_STATUS.INTERNAL_ERROR, {
    code: "INTERNAL_ERROR",
    message: "サーバーでエラーが発生しました",
  });
};

export const handleNotFound: NotFoundHandler = (c) =>
  respond(c, ERROR_STATUS.NOT_FOUND, { code: "NOT_FOUND", message: "指定されたURLはありません" });
