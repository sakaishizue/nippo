import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notification-target";

describe("notificationTarget", () => {
  it.each([
    ["submitted", "/reports/100"],
    ["approved", "/reports/100"],
    ["returned", "/reports/100"],
    ["commented", "/reports/100"],
  ] as const)("%s の通知は日報詳細を開く", (type, path) => {
    expect(notificationTarget({ type, report_id: 100, target_date: null })).toBe(path);
  });

  it("リマインドは、日報があれば日報の編集を開く", () => {
    expect(
      notificationTarget({ type: "reminder", report_id: 100, target_date: "2026-11-11" }),
    ).toBe("/reports/100/edit");
  });

  it("リマインドは、日報がなければ対象日で日報の作成を開く", () => {
    expect(
      notificationTarget({ type: "reminder", report_id: null, target_date: "2026-11-11" }),
    ).toBe("/reports/new?date=2026-11-11");
  });

  it("日報のない通知(日報が消えた場合など)は開く画面がない", () => {
    expect(notificationTarget({ type: "approved", report_id: null, target_date: null })).toBeNull();
  });
});
