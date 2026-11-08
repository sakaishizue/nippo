import { type ErrorCode, type ErrorDetail, errorResponseSchema } from "@nippo/shared";
import type { z } from "zod";

/** API のベースURL(API仕様書 1.1) */
export const API_BASE_URL = "/api/v1";

/** API のエラーレスポンス(API仕様書 1.6)を型付きにしたもの */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly code: ErrorCode;
  /** VALIDATION_ERROR のときの項目ごとの内容 */
  readonly details: readonly ErrorDetail[];
  /** REPORT_ALREADY_EXISTS のときの既存の日報のID */
  readonly existingReportId: number | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { details?: readonly ErrorDetail[]; existingReportId?: number } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = options.details ?? [];
    this.existingReportId = options.existingReportId;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

// 本文が API仕様書 1.6 の形式でないとき(転送先の API が止まっているなど)に、ステータスコードから決める内容
const fallbackError = (status: number): { code: ErrorCode; message: string } => {
  switch (status) {
    case 400:
      return { code: "BAD_REQUEST", message: "リクエストの形式が正しくありません" };
    case 401:
      return { code: "UNAUTHENTICATED", message: "ログインしてください" };
    case 403:
      return { code: "FORBIDDEN", message: "この操作を行う権限がありません" };
    case 404:
      return { code: "NOT_FOUND", message: "データが見つかりません" };
    case 409:
      return { code: "CONFLICT", message: "現在の状態では実行できません" };
    case 422:
      return { code: "VALIDATION_ERROR", message: "入力内容に誤りがあります" };
    default:
      return {
        code: "INTERNAL_ERROR",
        message: "サーバーでエラーが発生しました。時間をおいてやり直してください",
      };
  }
};

/** エラーのレスポンスのステータスコードと本文を ApiError にする */
export const toApiError = (status: number, body: unknown): ApiError => {
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) {
    const { code, message } = fallbackError(status);
    return new ApiError(status, code, message);
  }
  const { code, message, details, existing_report_id } = parsed.data.error;
  return new ApiError(status, code, message, {
    details,
    existingReportId: existing_report_id,
  });
};

// 更新系のリクエスト(API仕様書 1.2)に付ける CSRFトークン。GET /me と POST /auth/login のレスポンスで受け取る
let csrfToken: string | null = null;

export const setCsrfToken = (token: string | null): void => {
  csrfToken = token;
};

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | readonly QueryValue[]>;

/** クエリ文字列を作る。配列は同じ名前で繰り返す(例: `status=submitted&status=returned`)。null と undefined は送らない */
export const buildQuery = (params: QueryParams | undefined): string => {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    const values: readonly QueryValue[] = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v !== null && v !== undefined) search.append(name, String(v));
    }
  }
  const query = search.toString();
  return query === "" ? "" : `?${query}`;
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions<T> = {
  query?: QueryParams;
  body?: unknown;
  /** レスポンスの本文を検証するスキーマ。省略すると検証しない */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
};

const parseBody = async (res: Response): Promise<unknown> => {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** API を呼ぶ。成功しなかった場合は ApiError を投げる */
export const request = async <T = unknown>(
  method: Method,
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> => {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (method !== "GET" && csrfToken) headers.set("X-CSRF-Token", csrfToken);

  const res = await fetch(`${API_BASE_URL}${path}${buildQuery(options.query)}`, {
    method,
    headers,
    // セッションCookie を送る。画面と API は同じオリジン
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const body = await parseBody(res);
  if (!res.ok) throw toApiError(res.status, body);
  return (options.schema ? options.schema.parse(body) : body) as T;
};

type WithoutBody<T> = Omit<RequestOptions<T>, "body">;

export const api = {
  get: <T = unknown>(path: string, options?: WithoutBody<T>) => request<T>("GET", path, options),
  post: <T = unknown>(path: string, options?: RequestOptions<T>) =>
    request<T>("POST", path, options),
  put: <T = unknown>(path: string, options?: RequestOptions<T>) => request<T>("PUT", path, options),
  patch: <T = unknown>(path: string, options?: RequestOptions<T>) =>
    request<T>("PATCH", path, options),
};
