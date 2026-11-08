import { describe, expect, it } from "vitest";
import { badgeLabel, MENUS, showsNotifications } from "./navigation";
import { SCREENS } from "./screens";

const labels = (role: keyof typeof MENUS) => MENUS[role].map((item) => item.label);

describe("MENUS", () => {
  it("画面定義書 3.1 のロールごとのメニュー", () => {
    expect(labels("member")).toEqual(["ホーム", "日報一覧", "作業時間集計", "顧客", "商談"]);
    expect(labels("manager")).toEqual([
      "ホーム",
      "承認待ち",
      "日報一覧",
      "作業時間集計",
      "顧客",
      "商談",
    ]);
    expect(labels("admin")).toEqual(["ユーザー管理", "日報一覧", "顧客", "商談"]);
  });

  it("メニューの移動先は、そのロールが使える画面", () => {
    for (const role of ["member", "manager", "admin"] as const) {
      for (const item of MENUS[role]) {
        const screen = SCREENS.find((s) => s.path === item.to);
        expect(screen, item.to).toBeDefined();
        const roles: readonly string[] | undefined =
          screen && "roles" in screen ? screen.roles : undefined;
        expect(roles === undefined || roles.includes(role), `${role} ${item.to}`).toBe(true);
      }
    }
  });
});

describe("showsNotifications", () => {
  it("管理者には通知を表示しない", () => {
    expect(showsNotifications("member")).toBe(true);
    expect(showsNotifications("manager")).toBe(true);
    expect(showsNotifications("admin")).toBe(false);
  });
});

describe("badgeLabel", () => {
  it.each([
    [0, null],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
  ])("未読 %i 件は %s", (count, label) => {
    expect(badgeLabel(count)).toBe(label);
  });
});
