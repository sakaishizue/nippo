import { describe, expect, it } from "vitest";
import { groupOptions, monthRange, summarySearchFrom, summarySearchQuery } from "./summary-search";

const TODAY = "2026-11-12";

describe("monthRange", () => {
  it.each([
    ["2026-11-12", "2026-11-01", "2026-11-30"],
    ["2026-12-31", "2026-12-01", "2026-12-31"],
    ["2028-02-10", "2028-02-01", "2028-02-29"],
  ])("%s の月は %s から %s", (date, from, to) => {
    expect(monthRange(date)).toEqual({ from, to });
  });
});

describe("groupOptions", () => {
  it("一般には担当者別を出さない", () => {
    expect(groupOptions("member")).not.toContain("user");
    expect(groupOptions("manager")).toEqual(["user", "category", "customer", "deal"]);
  });
});

describe("summarySearchFrom と summarySearchQuery", () => {
  it("URL に条件がなければ、今月と、ロールごとの切り口の初期値", () => {
    expect(summarySearchFrom(new URLSearchParams(), "manager", TODAY)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
      groupBy: "user",
      userIds: [],
    });
    expect(summarySearchFrom(new URLSearchParams(), "member", TODAY).groupBy).toBe("category");
  });

  it("一般が URL で担当者別や担当者を指定しても使わない", () => {
    const params = new URLSearchParams("group_by=user&user_id=12");
    expect(summarySearchFrom(params, "member", TODAY)).toMatchObject({
      groupBy: "category",
      userIds: [],
    });
  });

  it("上長の担当者を読む", () => {
    const params = new URLSearchParams("group_by=deal&user_id=12&user_id=13&user_id=x");
    expect(summarySearchFrom(params, "manager", TODAY)).toMatchObject({
      groupBy: "deal",
      userIds: [12, 13],
    });
  });

  it("初期値と同じ条件は URL に入れない。部下を全員選んだら指定なし", () => {
    const search = {
      from: "2026-11-01",
      to: "2026-11-30",
      groupBy: "user" as const,
      userIds: [12, 13],
    };
    expect(summarySearchQuery(search, "manager", TODAY, [12, 13])).toEqual({
      from: null,
      to: null,
      group_by: null,
      user_id: [],
    });
    expect(
      summarySearchQuery(
        { ...search, from: "2026-10-01", userIds: [12] },
        "manager",
        TODAY,
        [12, 13],
      ),
    ).toEqual({ from: "2026-10-01", to: null, group_by: null, user_id: [12] });
  });
});
