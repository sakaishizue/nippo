import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, api, buildQuery, setCsrfToken, toApiError } from "./api";

describe("toApiError", () => {
  it("API仕様書 1.6 の形式のエラーを、ステータスコードとエラーコード付きの ApiError にする", () => {
    const error = toApiError(422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "入力内容に誤りがあります",
        details: [{ field: "work_entries[0].minutes", message: "1以上の整数を入力してください" }],
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "入力内容に誤りがあります",
      details: [{ field: "work_entries[0].minutes", message: "1以上の整数を入力してください" }],
      existingReportId: undefined,
    });
  });

  it("REPORT_ALREADY_EXISTS の既存の日報のIDを取り出す", () => {
    const error = toApiError(409, {
      error: {
        code: "REPORT_ALREADY_EXISTS",
        message: "同じ日付の日報があります",
        existing_report_id: 98,
      },
    });
    expect(error).toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
      existingReportId: 98,
      details: [],
    });
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "VALIDATION_ERROR"],
    [500, "INTERNAL_ERROR"],
    [502, "INTERNAL_ERROR"],
  ] as const)("本文が仕様の形式でない %i は %s として扱う", (status, code) => {
    const error = toApiError(status, "<html>Bad Gateway</html>");
    expect(error).toMatchObject({ status, code, details: [] });
    expect(error.message).not.toBe("");
  });

  it("未知のエラーコードは、ステータスコードから決める", () => {
    expect(toApiError(409, { error: { code: "UNKNOWN", message: "x" } })).toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("buildQuery", () => {
  it("配列は同じ名前で繰り返し、null と undefined は送らない", () => {
    expect(
      buildQuery({
        status: ["submitted", "returned"],
        q: "提案",
        page: 2,
        user_id: null,
        to: undefined,
      }),
    ).toBe("?status=submitted&status=returned&q=%E6%8F%90%E6%A1%88&page=2");
  });

  it("送る値がなければ空文字", () => {
    expect(buildQuery(undefined)).toBe("");
    expect(buildQuery({ q: undefined })).toBe("");
  });
});

describe("api", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const lastRequest = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    return { url, init, headers: new Headers(init?.headers) };
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("token-1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    setCsrfToken(null);
  });

  it("ベースURL /api/v1 に、Cookie を送る設定で GET する。GET には CSRFトークンを付けない", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [] }));
    await expect(api.get("/reports", { query: { page: 1 } })).resolves.toEqual({ items: [] });
    const { url, init, headers } = lastRequest();
    expect(url).toBe("/api/v1/reports?page=1");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect(headers.has("X-CSRF-Token")).toBe(false);
  });

  it.each(["post", "put", "patch"] as const)(
    "%s には CSRFトークンと JSON の本文を付ける",
    async (method) => {
      fetchMock.mockResolvedValue(json(200, { id: 1 }));
      await api[method]("/reports/1", { body: { reflection: "所感" } });
      const { init, headers } = lastRequest();
      expect(init?.method).toBe(method.toUpperCase());
      expect(headers.get("X-CSRF-Token")).toBe("token-1");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ reflection: "所感" }));
    },
  );

  it("CSRFトークンを受け取る前は、ヘッダーを付けない", async () => {
    setCsrfToken(null);
    fetchMock.mockResolvedValue(json(200, {}));
    await api.post("/auth/login", { body: { email: "a", password: "b" } });
    expect(lastRequest().headers.has("X-CSRF-Token")).toBe(false);
  });

  it("204 は undefined を返す", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.post("/auth/logout")).resolves.toBeUndefined();
  });

  it("エラーのレスポンスは ApiError を投げる", async () => {
    fetchMock.mockResolvedValue(
      json(401, { error: { code: "UNAUTHENTICATED", message: "ログインしてください" } }),
    );
    await expect(api.get("/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("schema を渡すと、レスポンスを検証する", async () => {
    const schema = z.object({ id: z.number() });
    fetchMock.mockResolvedValue(json(200, { id: 1 }));
    await expect(api.get("/x", { schema })).resolves.toEqual({ id: 1 });
    fetchMock.mockResolvedValue(json(200, { id: "1" }));
    await expect(api.get("/x", { schema })).rejects.toBeInstanceOf(z.ZodError);
  });
});
