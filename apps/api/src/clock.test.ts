import { afterEach, describe, expect, test } from "vitest";
import { now, setNow } from "./clock";

afterEach(() => {
  setNow(null);
});

describe("now", () => {
  test("固定していなければ現在日時を返す", () => {
    const before = Date.now();
    const value = now().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });

  test("setNow で固定した日時を返す", () => {
    setNow(new Date("2026-11-06T09:00:00+09:00"));
    expect(now().toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });

  test("返した日時を書き換えても、固定した日時は変わらない", () => {
    setNow(new Date("2026-11-06T09:00:00+09:00"));
    now().setFullYear(2000);
    expect(now().getFullYear()).toBe(2026);
  });

  test("setNow(null) で元に戻る", () => {
    setNow(new Date("2000-01-01T00:00:00Z"));
    setNow(null);
    expect(now().getFullYear()).toBeGreaterThan(2000);
  });
});
