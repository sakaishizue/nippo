import { expect, type Page, test } from "@playwright/test";

// SCR-06 承認待ち一覧。データはテスト仕様書 3章(開発用のシード)
// M1 の部下 U1 の R-sub(11月4日、11月4日 18:00 提出)は、提出から48時間以上経っている
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const main = (page: Page) => page.getByRole("main");
/** 承認待ちの1件。PC は表の行、スマートフォンはカードのどちらか見えている方 */
const entry = (page: Page, text: string) =>
  main(page).locator("tr, li").filter({ hasText: text }).filter({ visible: true }).first();

// テスト仕様書 E2E-18
test("提出から48時間以上の日報を強調して表示し、選ぶと日報詳細へ移動する", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("承認待ち一覧");

  // 提出日時の古い順のため、シードの R-sub が先頭
  const rSub = entry(page, "2026年11月4日");
  await expect(rSub).toContainText("山田 太郎");
  await expect(rSub).toContainText("2026年11月4日(水) 18:00");
  await expect(rSub).toContainText("48時間以上経過");
  await expect(rSub).toContainText("1時間30分");
  await expect(main(page).locator("tbody tr, li").filter({ visible: true }).first()).toContainText(
    "2026年11月4日",
  );

  await rSub.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/reports\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2026年11月4日(水)の日報");
});

test("部下以外の日報は表示しない(M2 には U3 の日報だけ)", async ({ page }) => {
  await loginAs(page, "m2@example.com");
  await page.goto("/approvals");
  await expect(entry(page, "田中 三郎")).toBeVisible();
  await expect(main(page)).not.toContainText("山田 太郎");
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("カードで表示し、横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "m1@example.com");
    await page.goto("/approvals");
    await expect(page.getByRole("list", { name: "承認待ち一覧" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
