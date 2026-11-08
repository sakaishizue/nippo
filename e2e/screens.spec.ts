import { expect, test } from "@playwright/test";

// 画面定義書の各画面のURLで、仮のページが開くことを確認する。画面ができたら各画面のテストに置き換える
const pages = [
  ["/login", "SCR-01 ログイン"],
  ["/", "SCR-02 ホーム"],
  ["/reports", "SCR-03 日報一覧"],
  ["/reports/new", "SCR-04 日報入力"],
  ["/reports/100/edit", "SCR-04 日報入力"],
  ["/reports/100", "SCR-05 日報詳細"],
  ["/approvals", "SCR-06 承認待ち一覧"],
  ["/summary", "SCR-07 作業時間集計"],
  ["/customers", "SCR-08 顧客一覧"],
  ["/customers/new", "SCR-10 顧客登録"],
  ["/customers/8", "SCR-09 顧客詳細"],
  ["/customers/8/edit", "SCR-10 顧客編集"],
  ["/deals", "SCR-11 商談一覧"],
  ["/deals/new", "SCR-13 商談登録"],
  ["/deals/31", "SCR-12 商談詳細"],
  ["/deals/31/edit", "SCR-13 商談編集"],
  ["/notifications", "SCR-14 通知一覧"],
  ["/admin/users", "SCR-15 ユーザー一覧"],
  ["/admin/users/new", "SCR-16 ユーザー登録"],
  ["/admin/users/12", "SCR-16 ユーザー編集"],
  ["/profile", "SCR-17 プロフィール"],
] as const;

for (const [path, heading] of pages) {
  test(`${path} で「${heading}」が開く`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("ID 付きのURLでは、ページにIDが渡る", async ({ page }) => {
  await page.goto("/reports/100");
  await expect(page.getByText("ID: 100")).toBeVisible();
});

test("存在しないURLでは「ページが見つかりません」を表示する", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ページが見つかりません");
});

test("ページの言語は日本語", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});
