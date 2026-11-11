import { expect, type Page, test } from "@playwright/test";

// SCR-01 ログイン。ユーザーはテスト仕様書 3章(開発用のシード)
const PASSWORD = "password123";

const fillAndSubmit = async (page: Page, email: string, password: string) => {
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
};

// テスト仕様書 E2E-11(ログイン後の移動先)
const destinations = [
  ["U1", "u1@example.com", "/", "ホーム"],
  ["M1", "m1@example.com", "/", "ホーム"],
  ["A1", "a1@example.com", "/admin/users", "ユーザー一覧"],
] as const;

for (const [user, email, path, heading] of destinations) {
  test(`${user} でログインすると ${path} に移動する`, async ({ page }) => {
    await page.goto("/login");
    await fillAndSubmit(page, email, PASSWORD);
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

test("別の画面から移動してきた場合は、ログイン後に元の画面に戻る", async ({ page }) => {
  await page.goto("/reports?status=submitted");
  await expect(page).toHaveURL("/login?redirect=%2Freports%3Fstatus%3Dsubmitted");
  await fillAndSubmit(page, "u1@example.com", PASSWORD);
  await expect(page).toHaveURL("/reports?status=submitted");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("日報一覧");
});

test("redirect に他のサイトが指定されていても、そのサイトには移動しない", async ({ page }) => {
  await page.goto("/login?redirect=%2F%2Fexample.com%2F");
  await fillAndSubmit(page, "u1@example.com", PASSWORD);
  await expect(page).toHaveURL("/");
});

test("パスワードが誤っていると、エラーメッセージを表示してログイン画面に留まる", async ({
  page,
}) => {
  await page.goto("/login");
  await fillAndSubmit(page, "u1@example.com", "wrong-password");
  await expect(page.getByRole("alert")).toHaveText(
    "メールアドレスまたはパスワードが正しくありません",
  );
  await expect(page).toHaveURL("/login");
});

test("存在しないメールアドレスでも、同じエラーメッセージを表示する", async ({ page }) => {
  await page.goto("/login");
  await fillAndSubmit(page, "nobody@example.com", PASSWORD);
  await expect(page.getByRole("alert")).toHaveText(
    "メールアドレスまたはパスワードが正しくありません",
  );
});

test("未入力の項目には、項目の下にエラーを表示する", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page.getByText("メールアドレスを入力してください")).toBeVisible();
  await expect(page.getByText("パスワードを入力してください")).toBeVisible();
  await expect(page).toHaveURL("/login");
});
