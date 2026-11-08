import { errorResponseSchema } from "@nippo/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { createApp } from "./app";
import { AppError, handleError, handleNotFound } from "./errors";
import { validate } from "./validator";

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logs.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const parsedLogs = () => logs.map((line) => JSON.parse(line) as Record<string, unknown>);

// 共通のエラー処理を付けたテスト用のアプリ
const createTestApp = () => {
  const app = new Hono();
  app.post(
    "/reports",
    validate(
      "json",
      z.object({
        report_date: z.iso.date(),
        work_entries: z.array(z.object({ minutes: z.number().int().min(1) })),
      }),
    ),
    (c) => c.json(c.req.valid("json")),
  );
  app.get("/conflict", () => {
    throw new AppError("REPORT_ALREADY_EXISTS", "同じ日付の日報があります", {
      extra: { existing_report_id: 98 },
    });
  });
  app.get("/boom", () => {
    throw new Error("connection refused: postgres://user:secret@db");
  });
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
};

describe("GET /api/v1/health", () => {
  test("200 を返す", async () => {
    const res = await createApp().request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("リクエストIDをヘッダーに付け、構造化ログに出す", async () => {
    const res = await createApp().request("/api/v1/health");
    const requestId = res.headers.get("X-Request-Id");
    expect(requestId).toBeTruthy();

    const [entry] = parsedLogs();
    expect(entry).toMatchObject({
      severity: "INFO",
      message: "GET /api/v1/health 200",
      requestId,
      httpRequest: {
        requestMethod: "GET",
        requestUrl: "/api/v1/health",
        status: 200,
        latency: expect.stringMatching(/^\d+\.\d{3}s$/),
      },
    });
  });
});

describe("存在しないURL", () => {
  test.each(["/api/v1/unknown", "/api/v2/health", "/"])("%s は 404 NOT_FOUND", async (path) => {
    const res = await createApp().request(path);
    expect(res.status).toBe(404);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("入力チェック", () => {
  const post = (body: string) =>
    createTestApp().request("/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  test("正しい入力は通る", async () => {
    const res = await post(
      JSON.stringify({ report_date: "2026-11-06", work_entries: [{ minutes: 30 }] }),
    );
    expect(res.status).toBe(200);
  });

  test("失敗すると 422 VALIDATION_ERROR を返し、項目を配列の添字付きで示す", async () => {
    const res = await post(
      JSON.stringify({
        report_date: "2026-02-30",
        work_entries: [{ minutes: 30 }, { minutes: 0 }],
      }),
    );
    expect(res.status).toBe(422);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("入力内容に誤りがあります");
    expect(body.error.details?.map((d) => d.field)).toEqual([
      "report_date",
      "work_entries[1].minutes",
    ]);
  });

  test("項目のメッセージは日本語", async () => {
    createApp(); // 日本語のメッセージを設定する
    const res = await post(JSON.stringify({ report_date: "2026-11-06", work_entries: [{}] }));
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.details?.[0]?.message).toMatch(/[ぁ-んァ-ン一-龥]/);
  });

  test("JSON として読めない本文は 400 BAD_REQUEST", async () => {
    const res = await post("{ not json");
    expect(res.status).toBe(400);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});

describe("エラーの変換", () => {
  test("AppError はエラーコードに対応するステータスと、追加の項目を返す", async () => {
    const res = await createTestApp().request("/conflict");
    expect(res.status).toBe(409);
    expect(errorResponseSchema.parse(await res.json())).toEqual({
      error: {
        code: "REPORT_ALREADY_EXISTS",
        message: "同じ日付の日報があります",
        existing_report_id: 98,
      },
    });
  });

  test("想定外のエラーは 500 INTERNAL_ERROR を返し、詳細はログにだけ出す", async () => {
    const res = await createTestApp().request("/boom");
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(errorResponseSchema.parse(JSON.parse(text)).error.code).toBe("INTERNAL_ERROR");
    expect(text).not.toContain("secret");

    const [entry] = parsedLogs();
    expect(entry).toMatchObject({ severity: "ERROR", message: expect.stringContaining("secret") });
    expect(entry?.stack).toEqual(expect.any(String));
  });
});
