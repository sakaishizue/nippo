import { toJstDateString } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { isBusinessDay, isHoliday, isWeekend, previousBusinessDay } from "./business-day";

describe("isBusinessDay", () => {
  test.each([
    ["2026-11-06", true, "平日(金曜日)"],
    ["2026-11-09", true, "平日(月曜日)"],
    ["2026-11-07", false, "土曜日"],
    ["2026-11-08", false, "日曜日"],
    ["2026-11-03", false, "祝日(文化の日、火曜日)"],
    ["2026-05-06", false, "振替休日(こどもの日の振替、水曜日)"],
    ["2026-09-22", false, "国民の休日(敬老の日と秋分の日に挟まれた火曜日)"],
    ["2027-01-01", false, "元日"],
  ])("%s は %s(%s)", (date, expected) => {
    expect(isBusinessDay(date)).toBe(expected);
  });

  test("年末年始の会社の休業日は扱わない(12月31日は平日なら営業日)", () => {
    expect(isBusinessDay("2026-12-31")).toBe(true);
    expect(isHoliday("2026-12-31")).toBe(false);
  });
});

describe("isWeekend と isHoliday", () => {
  test("土曜日の祝日は、週末かつ祝日", () => {
    // 2028-01-01(元日)は土曜日
    expect(isWeekend("2028-01-01")).toBe(true);
    expect(isHoliday("2028-01-01")).toBe(true);
    expect(isBusinessDay("2028-01-01")).toBe(false);
  });
});

describe("previousBusinessDay", () => {
  test.each([
    ["2026-11-06", "2026-11-05", "金曜日の前営業日は木曜日"],
    ["2026-11-09", "2026-11-06", "月曜日の前営業日は金曜日"],
    ["2026-11-08", "2026-11-06", "日曜日の前営業日は金曜日"],
    ["2026-11-04", "2026-11-02", "祝日明け(文化の日の翌日)の前営業日は祝日の前日"],
    ["2026-05-07", "2026-05-01", "大型連休明けは連休前の最後の営業日"],
    ["2026-09-24", "2026-09-18", "敬老の日から秋分の日までの連休明け"],
    ["2027-01-04", "2026-12-31", "年をまたぐ"],
  ])("%s → %s(%s)", (date, expected) => {
    expect(previousBusinessDay(date)).toBe(expected);
  });
});

describe("日本時間の扱い", () => {
  test("日本時間の朝(UTC ではまだ前日)の日付も、日本時間の日付で判定する", () => {
    // 文化の日の朝8時(UTC では 11月2日の23時)
    const date = toJstDateString(new Date("2026-11-03T08:00:00+09:00"));
    expect(date).toBe("2026-11-03");
    expect(isBusinessDay(date)).toBe(false);
  });
});

describe("入力のチェック", () => {
  test.each(["2026-11-6", "2026/11/06", "2026-02-30", ""])("%s はエラー", (date) => {
    expect(() => isBusinessDay(date)).toThrow(RangeError);
    expect(() => previousBusinessDay(date)).toThrow(RangeError);
  });
});
