import { describe, expect, it } from "vitest";
import { monthBefore, reportSearchFrom, reportSearchQuery, statusOptions } from "./report-list";

const TODAY = "2026-11-11";

describe("monthBefore", () => {
  it.each([
    ["2026-11-11", "2026-10-11"],
    ["2026-01-15", "2025-12-15"],
    // 前の月にその日がなければ、前の月の末日
    ["2026-03-31", "2026-02-28"],
    ["2028-03-30", "2028-02-29"],
  ])("%s の1か月前は %s", (date, expected) => {
    expect(monthBefore(date)).toBe(expected);
  });
});

describe("statusOptions", () => {
  it("一般は下書きを含む4つ。上長と管理者は下書きを除く", () => {
    expect(statusOptions("member")).toEqual(["draft", "submitted", "returned", "approved"]);
    expect(statusOptions("manager")).toEqual(["submitted", "returned", "approved"]);
    expect(statusOptions("admin")).toEqual(["submitted", "returned", "approved"]);
  });
});

describe("reportSearchFrom と reportSearchQuery", () => {
  it("URL に条件がなければ、期間は直近1か月", () => {
    expect(reportSearchFrom(new URLSearchParams(), TODAY)).toEqual({
      from: "2026-10-11",
      to: TODAY,
      userId: null,
      customerId: null,
      statuses: [],
      q: "",
    });
  });

  it("URL の条件を読む。不正なステータスとIDは無視する", () => {
    const params = new URLSearchParams(
      "from=2026-11-01&to=&user_id=12&customer_id=x&status=submitted&status=unknown&status=returned&q=見積",
    );
    expect(reportSearchFrom(params, TODAY)).toEqual({
      from: "2026-11-01",
      to: "",
      userId: 12,
      customerId: null,
      statuses: ["submitted", "returned"],
      q: "見積",
    });
  });

  it("期間が初期値なら URL に入れず、空(指定なし)は残す", () => {
    const query = reportSearchQuery(
      {
        from: "2026-10-11",
        to: "",
        userId: null,
        customerId: 8,
        statuses: ["approved"],
        q: "  ",
      },
      TODAY,
    );
    expect(query).toEqual({
      from: null,
      to: "",
      user_id: null,
      customer_id: 8,
      status: ["approved"],
      q: null,
    });
  });
});
