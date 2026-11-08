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
  ])("%s=%s はエラーになる", (key, value) => {
    expect(() => loadEnv({ DATABASE_URL: "x", [key]: value })).toThrow(new RegExp(key));
  });
});
