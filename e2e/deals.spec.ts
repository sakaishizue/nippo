import { expect, type Page, test } from "@playwright/test";

// SCR-11 商談一覧、SCR-12 商談詳細、SCR-13 商談登録・編集。データはテスト仕様書 3章(開発用のシード)
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const main = (page: Page) => page.getByRole("main");
const link = (page: Page, name: string | RegExp) =>
  main(page).getByRole("link", { name }).filter({ visible: true }).first();

/** 検索付きの選択欄で、顧客名を入力して候補から選ぶ */
const chooseCustomer = async (page: Page, label: string, name: string) => {
  const input = page.getByRole("combobox", { name: label });
  await input.fill(name.slice(0, 2));
  await page.getByRole("option", { name }).click();
  await expect(input).toHaveValue(name);
};

/** シードの D1(A株式会社の「新サービス導入」)の詳細を開く */
const openD1 = async (page: Page) => {
  await page.goto("/deals?owner_id=all&q=%E6%96%B0%E3%82%B5%E3%83%BC%E3%83%93%E3%82%B9");
  await link(page, /^新サービス導入/).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("新サービス導入");
};

// Issue #22 の受け入れ条件: 商談を登録し、一覧と詳細に表示される
test("商談を登録すると、詳細と一覧に表示される", async ({ page }, testInfo) => {
  test.slow();
  const name = `登録確認-${testInfo.project.name}-${Date.now()}`;
  await loginAs(page, "u1@example.com");
  await page.goto("/deals");
  await page.getByRole("link", { name: "新規登録" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("商談登録");

  await chooseCustomer(page, "顧客", "A株式会社");
  await page.getByLabel("商談名").fill(name);
  // 一般の担当者の初期値は自分
  await expect(page.getByLabel("担当者")).toHaveValue(/^\d+$/);
  await expect(page.getByLabel("担当者").locator("option:checked")).toHaveText("山田 太郎");
  await page.getByLabel("ステージ").selectOption("提案中");
  await page.getByLabel("見込金額(円)").fill("1500000");
  await expect(page.getByText("1,500,000円。")).toBeVisible();
  await page.getByLabel("受注予定日").fill("2027-03-31");
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("商談を登録しました")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const info = page.getByRole("region", { name: "商談情報" });
  await expect(info).toContainText("A株式会社");
  await expect(info).toContainText("山田 太郎");
  await expect(info).toContainText("提案中");
  await expect(info).toContainText("1,500,000円");
  await expect(info).toContainText("2027年3月31日(水)");

  await page.goto(`/deals?q=${encodeURIComponent(name)}`);
  await expect(link(page, name)).toBeVisible();
  await expect(main(page)).toContainText("1,500,000円");
});

test("未入力の項目と見込金額の誤りは、項目の下に表示する", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/deals/new");
  await page.getByLabel("見込金額(円)").fill("-1");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("顧客を選択してください")).toBeVisible();
  await expect(page.getByText("商談名を入力してください")).toBeVisible();
  // 上長には担当者の初期値がない
  await expect(page.getByText("担当者を選択してください")).toBeVisible();
  await expect(page.getByText("見込金額は0以上の整数で入力してください")).toBeVisible();
});

test("一般の一覧は、担当者の初期値が自分。すべてに変えると他の人の商談も出す", async ({ page }) => {
  await loginAs(page, "u2@example.com");
  await page.goto("/deals");
  await expect(page.getByLabel("担当者").locator("option:checked")).toHaveText("佐藤 花子");
  await expect(link(page, /^保守契約の更新/)).toBeVisible();
  await expect(main(page).getByText("新サービス導入")).toHaveCount(0);

  await page.getByLabel("担当者").selectOption("すべて");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL("/deals?owner_id=all");
  await expect(link(page, /^新サービス導入/)).toBeVisible();
});

test("ステージを選んで絞り込み、顧客でも絞り込める", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/deals");
  await page.getByRole("checkbox", { name: "交渉中" }).check();
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL("/deals?stage=negotiation");
  await expect(link(page, /^保守契約の更新/)).toBeVisible();
  await expect(main(page).getByText("新サービス導入")).toHaveCount(0);

  await page.getByRole("checkbox", { name: "交渉中" }).uncheck();
  await chooseCustomer(page, "顧客", "A株式会社");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL(/\/deals\?customer_id=\d+$/);
  await expect(link(page, /^新サービス導入/)).toBeVisible();
  await expect(main(page).getByText("保守契約の更新")).toHaveCount(0);
  // 戻ってきたときのために、選んだ顧客を検索欄に表示する
  await page.reload();
  await expect(page.getByRole("combobox", { name: "顧客" })).toHaveValue("A株式会社");
});

test("商談詳細に、商談情報と訪問履歴を表示する。顧客名から顧客詳細へ移動できる", async ({
  page,
}) => {
  await loginAs(page, "u2@example.com");
  await openD1(page);
  const info = page.getByRole("region", { name: "商談情報" });
  await expect(info).toContainText("3,000,000円");
  await expect(info).toContainText("2026年12月20日(日)");

  const visits = page.getByRole("list", { name: "訪問履歴" });
  await expect(visits.getByRole("listitem")).toHaveCount(2);
  await expect(visits).toContainText("見積の条件の確認");
  await expect(visits).not.toContainText("90分");

  await info.getByRole("link", { name: "A株式会社" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A株式会社");
});

test("訪問記録がある商談は、編集で顧客を変更できない", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await openD1(page);
  await page.getByRole("link", { name: "編集" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("商談編集");
  await expect(page.getByRole("combobox", { name: "顧客" })).toBeDisabled();
  await expect(page.getByText("訪問記録があるため、顧客は変更できません")).toBeVisible();
  await expect(page.getByLabel("見込金額(円)")).toHaveValue("3000000");
});

test("顧客詳細の「商談を追加」から開くと、顧客を選んだ状態になる", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/customers?q=B%E6%A0%AA");
  await link(page, /^B株式会社/).click();
  await page.getByRole("link", { name: "商談を追加" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("商談登録");
  await expect(page.getByRole("combobox", { name: "顧客" })).toHaveValue("B株式会社");
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("一覧はカードで表示し、横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "m1@example.com");
    await page.goto("/deals");
    await expect(page.getByRole("list", { name: "商談一覧" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
