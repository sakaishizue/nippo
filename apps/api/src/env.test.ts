import { describe, expect, test } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  test("省略できる項目には初期値が入る", () => {
    expect(loadEnv({ DATABASE_URL: "postgres://localhost/nippo" })).toEqual({
      NODE_ENV: "development",
      PORT: 8080,
      DATABASE_URL: "postgres://localhost/nippo",
    });
  });

  test("DATABASE_POOL_MAX は省略でき、指定すると数値に変換する", () => {
    expect(loadEnv({ DATABASE_URL: "x" }).DATABASE_POOL_MAX).toBeUndefined();
    expect(loadEnv({ DATABASE_URL: "x", DATABASE_POOL_MAX: "1" }).DATABASE_POOL_MAX).toBe(1);
  });

  test("PORT は数値に変換する", () => {
    expect(loadEnv({ DATABASE_URL: "x", PORT: "3000" }).PORT).toBe(3000);
  });

  test("DATABASE_URL がないと、項目名を含むエラーになる", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  test.each([
    ["PORT", "abc"],
    ["PORT", "70000"],
    ["NODE_ENV", "staging"],
    ["DATABASE_POOL_MAX", "0"],
    ["DATABASE_POOL_MAX", "abc"],
  ])("%s=%s はエラーになる", (key, value) => {
    expect(() => loadEnv({ DATABASE_URL: "x", [key]: value })).toThrow(new RegExp(key));
  });
});
