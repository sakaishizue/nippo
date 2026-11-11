import { describe, expect, it, test } from "vitest";
import { formatDate, formatDateTime, formatMinutes, formatYen } from "./format";

describe("formatMinutes", () => {
  test.each([
    [0, "0分"],
    [30, "30分"],
    [59, "59分"],
    [60, "1時間"],
    [61, "1時間1分"],
    [450, "7時間30分"],
    [750, "12時間30分"],
    [1440, "24時間"],
  ])("%i分は「%s」", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  test.each([-1, 1.5, Number.NaN])("%s はエラーになる", (minutes) => {
    expect(() => formatMinutes(minutes)).toThrow(RangeError);
  });
});

describe("formatDate", () => {
  it.each([
    ["2026-11-04", "2026年11月4日(水)"],
    ["2026-11-08", "2026年11月8日(日)"],
    ["2027-01-01", "2027年1月1日(金)"],
  ])("%s は %s", (date, text) => {
    expect(formatDate(date)).toBe(text);
  });

  it("形式が違う値はエラー", () => {
    expect(() => formatDate("2026/11/04")).toThrow(RangeError);
  });
});

describe("formatYen", () => {
  it.each([
    [0, "0円"],
    [3_000_000, "3,000,000円"],
    [2_147_483_647, "2,147,483,647円"],
  ])("%i は %s", (amount, text) => {
    expect(formatYen(amount)).toBe(text);
  });
});

describe("formatDateTime", () => {
  test.each([
    ["2026-11-06T18:30:00+09:00", "2026年11月6日(金) 18:30"],
    // UTC で渡しても日本時間で表示する(日付をまたぐ場合)
    ["2026-11-06T15:05:00Z", "2026年11月7日(土) 00:05"],
  ])("%s は「%s」", (dateTime, expected) => {
    expect(formatDateTime(dateTime)).toBe(expected);
  });

  it("日時でなければエラーになる", () => {
    expect(() => formatDateTime("not a date")).toThrow(RangeError);
  });
});
