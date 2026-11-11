import { expect, type Page, test } from "@playwright/test";

// SCR-03 日報一覧。データはテスト仕様書 3章(開発用のシード)
// U1 の日報: 11月2日(承認済み)、3日(差し戻し、B株式会社への訪問)、4日(提出済み)、5日(下書き)。U3 は 11月4日(提出済み)
const PASSWORD = "password123";
// シードの日報だけが入る期間(他の画面テストが作る日報は 2000〜2025年)
const PERIOD = "from=2026-11-01&to=2026-11-10";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const main = (page: Page) => page.getByRole("main");
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
/** 一覧の日付のリンク。PC は表、スマートフォンはカードのどちらか見えている方 */
const reportLinks = (page: Page) =>
  main(page)
    .getByRole("link", { name: /^2026年11月\d+日/ })
    .filter({ visible: true });
const dates = async (page: Page) =>
  (await reportLinks(page).allTextContents()).map((text) => /2026年11月\d+日/.exec(text)?.[0]);

/** スマートフォンでは、折りたたまれた検索条件を開く */
const openSearch = async (page: Page) => {
  if ((page.viewportSize()?.width ?? 1280) >= 768) return;
  // 検索条件は担当者の選択肢などがそろってから出るため、開閉のボタンが出るのを待つ
  await expect(page.getByRole("button", { name: /^検索条件を(開く|閉じる)$/ })).toBeVisible();
  const button = page.getByRole("button", { name: "検索条件を開く" });
  if (await button.isVisible()) await button.click();
};

test("一般は自分の日報を新しい順に表示する。担当者の欄と条件は出さない", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto(`/reports?${PERIOD}`);
  await expect(heading(page)).toHaveText("日報一覧");
  await expect
    .poll(() => dates(page))
    .toEqual(["2026年11月5日", "2026年11月4日", "2026年11月3日", "2026年11月2日"]);
  await openSearch(page);
  await expect(page.getByLabel("担当者")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "下書き" })).toBeVisible();
  await expect(page.getByRole("link", { name: "日報を作成" })).toBeVisible();
});

test("PC の一覧に、ステータス、訪問件数、合計時間、コメント数を表示する", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) < 768, "PC の表の確認");
  await loginAs(page, "m1@example.com");
  await page.goto(`/reports?${PERIOD}&status=approved`);
  const row = page.getByRole("row", { name: /2026年11月2日/ });
  await expect(row).toContainText("山田 太郎");
  await expect(row).toContainText("承認済み");
  await expect(row).toContainText("1件");
  await expect(row).toContainText("2時間30分");
});

test("キーワードと顧客で絞り込む", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto(`/reports?${PERIOD}`);
  await openSearch(page);
  await page.getByLabel("キーワード").fill("新サービス");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect.poll(() => dates(page)).toEqual(["2026年11月2日"]);

  await openSearch(page);
  await page.getByLabel("キーワード").fill("");
  const customer = page.getByRole("combobox", { name: "顧客" });
  await customer.fill("B株");
  await page.getByRole("option", { name: "B株式会社" }).click();
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page).toHaveURL(/customer_id=\d+/);
  await expect.poll(() => dates(page)).toEqual(["2026年11月3日"]);
});

test("管理者は全員の日報から担当者で絞り込める。下書きは選べない", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto(`/reports?${PERIOD}`);
  await openSearch(page);
  await expect(page.getByRole("checkbox", { name: "下書き" })).toHaveCount(0);
  await page.getByLabel("担当者").selectOption("田中 三郎");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect.poll(() => dates(page)).toEqual(["2026年11月4日"]);
});

// テスト仕様書 E2E-14
test("検索して詳細を開き、ブラウザで戻ると、検索条件と結果が再現される", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/reports");
  await openSearch(page);
  await page.getByLabel("期間の開始").fill("2026-11-01");
  await page.getByLabel("期間の終了").fill("2026-11-10");
  await page.getByLabel("担当者").selectOption("山田 太郎");
  await page.getByRole("checkbox", { name: "差し戻し" }).check();
  await page.getByRole("checkbox", { name: "承認済み" }).check();
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page).toHaveURL(/status=returned&status=approved/);
  await expect.poll(() => dates(page)).toEqual(["2026年11月3日", "2026年11月2日"]);
  const url = page.url();

  await reportLinks(page).first().click();
  await expect(heading(page)).toHaveText("2026年11月3日(火)の日報");
  await page.goBack();

  await expect(page).toHaveURL(url);
  await expect.poll(() => dates(page)).toEqual(["2026年11月3日", "2026年11月2日"]);
  await expect(page.getByLabel("期間の開始")).toHaveValue("2026-11-01");
  await expect(page.getByLabel("期間の終了")).toHaveValue("2026-11-10");
  await expect(page.getByLabel("担当者").locator("option:checked")).toHaveText("山田 太郎");
  await expect(page.getByRole("checkbox", { name: "差し戻し" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "承認済み" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "提出済み" })).not.toBeChecked();
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("検索条件は折りたたみ、一覧はカードで表示する。横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "u1@example.com");
    await page.goto("/reports");
    await expect(page.getByRole("form", { name: "日報の検索" })).toBeHidden();
    await page.getByRole("button", { name: "検索条件を開く" }).click();
    await expect(page.getByRole("form", { name: "日報の検索" })).toBeVisible();

    await page.goto(`/reports?${PERIOD}`);
    await expect(page.getByRole("list", { name: "日報一覧" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
