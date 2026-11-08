import { describe, expect, test } from "vitest";
import { z } from "zod";
import { paginatedSchema, paginationQuerySchema } from "./pagination";

describe("paginationQuerySchema", () => {
  test("省略時は page が1、per_page が20になる", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, per_page: 20 });
  });

  test("クエリ文字列の値を数値に変換する", () => {
    expect(paginationQuerySchema.parse({ page: "3", per_page: "50" })).toEqual({
      page: 3,
      per_page: 50,
    });
  });

  test("per_page は100まで", () => {
    expect(paginationQuerySchema.safeParse({ per_page: "100" }).success).toBe(true);
    expect(paginationQuerySchema.safeParse({ per_page: "101" }).success).toBe(false);
  });

  test.each(["0", "-1", "1.5", "abc"])("page に %s は指定できない", (page) => {
    expect(paginationQuerySchema.safeParse({ page }).success).toBe(false);
  });
});

describe("paginatedSchema", () => {
  const schema = paginatedSchema(z.object({ id: z.number() }));

  test("API仕様書 1.4 の形式を受け付ける", () => {
    const result = schema.safeParse({
      items: [{ id: 1 }],
      pagination: { page: 1, per_page: 20, total: 135 },
    });
    expect(result.success).toBe(true);
  });

  test("items の各要素を検証する", () => {
    const result = schema.safeParse({
      items: [{ id: "1" }],
      pagination: { page: 1, per_page: 20, total: 1 },
    });
    expect(result.success).toBe(false);
  });
});
