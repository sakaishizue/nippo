import { describe, expect, it } from "vitest";
import { lastDayOfYearFrom, workTimeSummaryQuerySchema } from "./summary";

describe("lastDayOfYearFrom", () => {
  it.each([
    ["2026-01-01", "2026-12-31"],
    ["2026-11-12", "2027-11-11"],
    // うるう日から1年は、翌年の2月28日まで
    ["2028-02-29", "2029-02-28"],
    ["2027-03-01", "2028-02-29"],
  ])("%s から1年は %s まで", (from, last) => {
    expect(lastDayOfYearFrom(from)).toBe(last);
  });
});

describe("workTimeSummaryQuerySchema", () => {
  const parse = (query: Record<string, unknown>) =>
    workTimeSummaryQuerySchema.safeParse({ group_by: "category", ...query });

  it("担当者は1つでも複数でも配列にする", () => {
    expect(parse({ from: "2026-11-01", to: "2026-11-30", user_id: "12" }).data?.user_id).toEqual([
      12,
    ]);
    expect(
      parse({ from: "2026-11-01", to: "2026-11-30", user_id: ["12", "13"] }).data?.user_id,
    ).toEqual([12, 13]);
  });

  it("開始と終了が同じ日はよい。終了が開始より前はエラー", () => {
    expect(parse({ from: "2026-11-01", to: "2026-11-01" }).success).toBe(true);
    expect(parse({ from: "2026-11-02", to: "2026-11-01" }).success).toBe(false);
  });
});
