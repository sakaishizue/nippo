import { expect, type Page, test } from "@playwright/test";

// テスト仕様書 3章のユーザー(開発用のシード)。パスワードは全員同じ
const USERS = {
  A1: "a1@example.com",
  M1: "m1@example.com",
  U1: "u1@example.com",
} as const;
type User = keyof typeof USERS;

/** API でログインする。page.request は画面と Cookie を共有するため、以降の画面はログイン済みで開く */
const loginAs = async (page: Page, user: User) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email: USERS[user], password: "password123" },
  });
  expect(res.status()).toBe(200);
};

// 画面定義書の各画面のURLで、仮のページが開くことを確認する。画面ができたら各画面のテストに置き換える
// ユーザーは、その画面を使えるロールの人(null はログインしない)
const pages: readonly (readonly [string, string, User | null])[] = [
  ["/", "SCR-02 ホーム", "U1"],
  ["/reports", "SCR-03 日報一覧", "U1"],
  ["/reports/new", "SCR-04 日報入力", "U1"],
  ["/reports/100/edit", "SCR-04 日報入力", "U1"],
  ["/reports/100", "SCR-05 日報詳細", "U1"],
  ["/approvals", "SCR-06 承認待ち一覧", "M1"],
  ["/summary", "SCR-07 作業時間集計", "M1"],
  ["/customers", "SCR-08 顧客一覧", "A1"],
  ["/customers/new", "SCR-10 顧客登録", "U1"],
  ["/customers/8", "SCR-09 顧客詳細", "U1"],
  ["/customers/8/edit", "SCR-10 顧客編集", "U1"],
  ["/deals", "SCR-11 商談一覧", "M1"],
  ["/deals/new", "SCR-13 商談登録", "U1"],
  ["/deals/31", "SCR-12 商談詳細", "U1"],
  ["/deals/31/edit", "SCR-13 商談編集", "U1"],
  ["/notifications", "SCR-14 通知一覧", "U1"],
  ["/admin/users", "SCR-15 ユーザー一覧", "A1"],
  ["/admin/users/new", "SCR-16 ユーザー登録", "A1"],
  ["/admin/users/12", "SCR-16 ユーザー編集", "A1"],
  ["/profile", "SCR-17 プロフィール", "A1"],
];

for (const [path, heading, user] of pages) {
  test(`${path} で「${heading}」が開く`, async ({ page }) => {
    if (user) await loginAs(page, user);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("ID 付きのURLでは、ページにIDが渡る", async ({ page }) => {
  await loginAs(page, "U1");
  await page.goto("/reports/100");
  await expect(page.getByText("ID: 100")).toBeVisible();
});

test("存在しないURLでは「ページが見つかりません」を表示する", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ページが見つかりません");
});

test("ページの言語は日本語", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test.describe("ログイン状態と権限", () => {
  test("ログインしていない状態で画面を開くと、元の画面を付けてログイン画面に移動する", async ({
    page,
  }) => {
    await page.goto("/reports?status=submitted");
    await expect(page).toHaveURL("/login?redirect=%2Freports%3Fstatus%3Dsubmitted");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ログイン");
  });

  test("ログインしていない状態でホームを開くと、ログイン画面に移動する", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("ログアウトした後に画面を開くと、ログイン画面に移動する", async ({ page }) => {
    await loginAs(page, "U1");
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SCR-03 日報一覧");

    // セッションCookie を消して、セッション切れと同じ状態にする
    await page.context().clearCookies();
    await page.reload();
    await expect(page).toHaveURL("/login?redirect=%2Freports");
  });

  // テスト仕様書 E2E-13
  test("一般がユーザー一覧のURLを直接開くと、エラー画面(403)を表示する", async ({ page }) => {
    await loginAs(page, "U1");
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "この画面を表示する権限がありません",
    );
  });

  const forbidden = [
    ["M1", "/reports/new"],
    ["U1", "/approvals"],
    ["A1", "/"],
    ["A1", "/notifications"],
  ] as const;
  for (const [user, path] of forbidden) {
    test(`${user} が ${path} を開くと、エラー画面(403)を表示する`, async ({ page }) => {
      await loginAs(page, user);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "この画面を表示する権限がありません",
      );
    });
  }
});
