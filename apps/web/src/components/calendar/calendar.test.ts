import { describe, expect, it } from "vitest";
import { canMoveMonth, dayLabelOf, dayLinkOf, dayMarkOf, isWeekend } from "./calendar";

const TODAY = "2026-11-20";

describe("dayLinkOf(日付を選んだときの移動先)", () => {
  it("一般で日報がなければ、その日付で新規作成", () => {
    expect(dayLinkOf("member", "2026-11-06", null, TODAY)).toBe("/reports/new?date=2026-11-06");
    expect(dayLinkOf("member", TODAY, undefined, TODAY)).toBe(`/reports/new?date=${TODAY}`);
  });

  it("一般の下書きと差し戻しは編集、提出済みと承認済みは詳細", () => {
    expect(dayLinkOf("member", "2026-11-05", { id: 5, status: "draft" }, TODAY)).toBe(
      "/reports/5/edit",
    );
    expect(dayLinkOf("member", "2026-11-03", { id: 3, status: "returned" }, TODAY)).toBe(
      "/reports/3/edit",
    );
    expect(dayLinkOf("member", "2026-11-04", { id: 4, status: "submitted" }, TODAY)).toBe(
      "/reports/4",
    );
    expect(dayLinkOf("member", "2026-11-02", { id: 2, status: "approved" }, TODAY)).toBe(
      "/reports/2",
    );
  });

  it("上長と管理者は、その日の日報一覧", () => {
    expect(dayLinkOf("manager", "2026-11-04", null, TODAY)).toBe(
      "/reports?from=2026-11-04&to=2026-11-04",
    );
    expect(dayLinkOf("admin", "2026-11-04", null, TODAY)).toBe(
      "/reports?from=2026-11-04&to=2026-11-04",
    );
  });

  it("未来の日は選べない", () => {
    expect(dayLinkOf("member", "2026-11-21", null, TODAY)).toBeNull();
    expect(dayLinkOf("manager", "2026-12-01", null, TODAY)).toBeNull();
  });
});

describe("dayMarkOf(一般の日の印)", () => {
  it("日報があればステータス", () => {
    expect(
      dayMarkOf(
        { date: "2026-11-03", day_off: true, report: { id: 1, status: "returned" } },
        TODAY,
      ),
    ).toBe("returned");
  });

  it("過去の営業日で日報がなければ未作成。休日、今日、未来は印なし", () => {
    expect(dayMarkOf({ date: "2026-11-06", day_off: false, report: null }, TODAY)).toBe("missing");
    expect(dayMarkOf({ date: "2026-11-07", day_off: true, report: null }, TODAY)).toBeNull();
    expect(dayMarkOf({ date: TODAY, day_off: false, report: null }, TODAY)).toBeNull();
    expect(dayMarkOf({ date: "2026-11-24", day_off: false, report: null }, TODAY)).toBeNull();
  });
});

describe("dayLabelOf(日付の読み上げ)", () => {
  it("日付、今日、祝日の名前、印の順", () => {
    expect(dayLabelOf("2026-11-03", { holidayName: "文化の日", mark: "returned" })).toBe(
      "2026年11月3日(火) 文化の日 差し戻し",
    );
    expect(dayLabelOf("2026-11-06", { mark: "missing", today: true })).toBe(
      "2026年11月6日(金) 今日 未作成",
    );
    expect(dayLabelOf("2026-11-07", {})).toBe("2026年11月7日(土)");
  });
});

describe("isWeekend と canMoveMonth", () => {
  it("土日は週末", () => {
    expect(isWeekend("2026-11-07")).toBe(true);
    expect(isWeekend("2026-11-08")).toBe(true);
    expect(isWeekend("2026-11-09")).toBe(false);
  });

  it("2000年1月より前と2050年12月より後には移動できない", () => {
    expect(canMoveMonth("2026-11", 1)).toBe(true);
    expect(canMoveMonth("2000-01", -1)).toBe(false);
    expect(canMoveMonth("2050-12", 1)).toBe(false);
  });
});
