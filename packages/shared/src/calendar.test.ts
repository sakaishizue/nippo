import { describe, expect, it } from "vitest";
import { addMonths, calendarQuerySchema, datesOfMonth, dayOfWeek, monthOf } from "./calendar";

describe("calendarQuerySchema", () => {
  it.each(["2026-11", "2000-01", "2050-12"])("%s はよい", (month) => {
    expect(calendarQuerySchema.safeParse({ month }).success).toBe(true);
  });

  it.each(["2026-13", "2026-00", "2026-1", "2026/11", "1999-12", "2051-01", ""])(
    "%s はエラー",
    (month) => {
      expect(calendarQuerySchema.safeParse({ month }).success).toBe(false);
    },
  );

  it("月がないとエラー", () => {
    expect(calendarQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe("月の計算", () => {
  it("monthOf は日付の月", () => {
    expect(monthOf("2026-11-04")).toBe("2026-11");
  });

  it.each([
    ["2026-11", 1, "2026-12"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-11", -23, "2024-12"],
  ])("%s の %i か月後は %s", (month, months, expected) => {
    expect(addMonths(month, months)).toBe(expected);
  });

  it("datesOfMonth は1日から月末まで。うるう年の2月は29日", () => {
    expect(datesOfMonth("2026-11")).toHaveLength(30);
    expect(datesOfMonth("2026-11")[0]).toBe("2026-11-01");
    expect(datesOfMonth("2026-11").at(-1)).toBe("2026-11-30");
    expect(datesOfMonth("2028-02").at(-1)).toBe("2028-02-29");
    expect(datesOfMonth("2026-02").at(-1)).toBe("2026-02-28");
  });

  it("dayOfWeek は 0 が日曜日", () => {
    expect(dayOfWeek("2026-11-01")).toBe(0);
    expect(dayOfWeek("2026-11-07")).toBe(6);
  });
});
