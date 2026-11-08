import { describe, expect, it } from "vitest";
import { homePathFor, loginPathFor, safeRedirectPath } from "./redirect";

describe("loginPathFor", () => {
  it("元の画面のパス、クエリ、ハッシュを redirect に入れる", () => {
    expect(loginPathFor({ pathname: "/reports", search: "?from=2026-11-01&status=draft" })).toBe(
      "/login?redirect=%2Freports%3Ffrom%3D2026-11-01%26status%3Ddraft",
    );
    expect(loginPathFor({ pathname: "/reports/1", search: "", hash: "#comments" })).toBe(
      "/login?redirect=%2Freports%2F1%23comments",
    );
  });

  it("ホームとログイン画面からは redirect を付けない", () => {
    expect(loginPathFor({ pathname: "/" })).toBe("/login");
    expect(loginPathFor({ pathname: "/login", search: "?redirect=%2Freports" })).toBe("/login");
  });

  it("作った URL から safeRedirectPath で元の画面に戻れる", () => {
    const path = loginPathFor({ pathname: "/reports", search: "?q=提案" });
    const redirect = new URL(path, "http://localhost").searchParams.get("redirect");
    expect(safeRedirectPath(redirect)).toBe("/reports?q=%E6%8F%90%E6%A1%88");
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/reports", "/reports"],
    ["/reports?status=draft#x", "/reports?status=draft#x"],
    ["/", "/"],
  ])("サイト内のパス %s を受け付ける", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "reports",
    "https://example.com/",
    "//example.com/",
    "/\\example.com/",
    "/\t/example.com/",
    "/login",
    "/login?redirect=%2Freports",
    "javascript:alert(1)",
  ])("%s は受け付けない", (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});

describe("homePathFor", () => {
  it("一般と上長はホーム、管理者はユーザー一覧", () => {
    expect(homePathFor("member")).toBe("/");
    expect(homePathFor("manager")).toBe("/");
    expect(homePathFor("admin")).toBe("/admin/users");
  });
});
