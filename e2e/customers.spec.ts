import { expect, type Page, test } from "@playwright/test";

// SCR-08 顧客一覧、SCR-09 顧客詳細、SCR-10 顧客登録・編集。データはテスト仕様書 3章(開発用のシード)
const PASSWORD = "password123";

/** ログインし、更新系の API に付ける CSRFトークンを返す */
const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
  const { csrf_token: csrfToken } = (await res.json()) as { csrf_token: string };
  return csrfToken;
};

/** テストのたびに違う顧客名(他のテストや前回の実行と重ならないように) */
const uniqueName = (label: string, project: string) => `${label}-${project}-${Date.now()}`;

const main = (page: Page) => page.getByRole("main");

test("一覧から顧客名で検索し、詳細を開いて戻ると検索条件を再現する", async ({ page }) => {
  await loginAs(page, "u2@example.com");
  await page.goto("/customers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客一覧");
  await page.getByLabel("顧客名").fill("B株");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL("/customers?q=B%E6%A0%AA");
  await expect(
    main(page)
      .getByRole("link", { name: /^B株式会社/ })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(main(page).getByText("A株式会社")).toHaveCount(0);

  await main(page)
    .getByRole("link", { name: /^B株式会社/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("B株式会社");
  await page.goBack();
  await expect(page.getByLabel("顧客名")).toHaveValue("B株");
});

test.describe("PC", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("一覧は表で、商談数と最終訪問日(提出済み以降の訪問)を表示する", async ({ page }) => {
    await loginAs(page, "u1@example.com");
    await page.goto("/customers?q=A%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE");
    const table = page.getByRole("table", { name: "顧客一覧" });
    await expect(table.getByRole("columnheader")).toHaveText([
      "顧客名",
      "住所",
      "電話番号",
      "商談数",
      "最終訪問日",
    ]);
    // 下書き(11月5日)の訪問は数えない
    await expect(table.getByRole("row", { name: /^A株式会社 東京都/ })).toContainText(
      "2026年11月4日(水)",
    );
  });
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("一覧はカードで表示し、横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "u1@example.com");
    await page.goto("/customers");
    await expect(page.getByRole("list", { name: "顧客一覧" })).toBeVisible();
    await expect(page.getByRole("table")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test("顧客詳細に、商談と訪問履歴を表示する。訪問履歴に作業時間や所感は出さない", async ({
  page,
}) => {
  // 訪問記録は他の営業担当者にも共有する(U2 で U1 の訪問を見る)
  await loginAs(page, "u2@example.com");
  await page.goto("/customers?q=A%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE");
  await main(page)
    .getByRole("link", { name: /^A株式会社/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A株式会社");

  const info = page.getByRole("region", { name: "顧客情報" });
  await expect(info).toContainText("東京都千代田区丸の内1-1-1");
  await expect(info).toContainText("03-1234-5678");

  const deals = page.getByRole("region", { name: "商談" });
  await expect(
    deals.getByRole("link", { name: /新サービス導入/ }).filter({ visible: true }),
  ).toBeVisible();
  const customerId = page.url().split("/").pop();
  await expect(page.getByRole("link", { name: "商談を追加" })).toHaveAttribute(
    "href",
    `/deals/new?customer_id=${customerId}`,
  );

  const visits = page.getByRole("list", { name: "訪問履歴" });
  await expect(visits.getByRole("listitem")).toHaveCount(2);
  await expect(visits.getByRole("listitem").first()).toContainText("2026年11月4日(水)");
  await expect(visits.getByRole("listitem").first()).toContainText("見積の条件の確認");
  await expect(visits.getByRole("listitem").nth(1)).toContainText("来週までに見積を提示");
  await expect(visits).toContainText("山田 太郎");
  // 下書きの訪問、所感、作業時間は出さない
  await expect(visits).not.toContainText("見積書の説明");
  await expect(page.getByRole("main")).not.toContainText("提案資料の反応がよかった");
  await expect(visits).not.toContainText("90分");
});

test("顧客を登録して編集できる。電話番号の形式の誤りは項目の下に表示する", async ({
  page,
}, testInfo) => {
  const name = uniqueName("登録確認", testInfo.project.name);
  await loginAs(page, "m1@example.com");
  await page.goto("/customers");
  await page.getByRole("link", { name: "新規登録" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客登録");

  await page.getByLabel("顧客名").fill(name);
  await page.getByLabel("電話番号").fill("03(1234)5678");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("電話番号は数字とハイフンで入力してください")).toBeVisible();

  await page.getByLabel("電話番号").fill("092-123-4567");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("顧客を登録しました")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("region", { name: "顧客情報" })).toContainText("092-123-4567");

  await page.getByRole("link", { name: "編集" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("顧客編集");
  await expect(page.getByLabel("顧客名")).toHaveValue(name);
  await page.getByLabel("住所").fill("福岡県福岡市中央区天神3-3-3");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("顧客を保存しました")).toBeVisible();
  await expect(page.getByRole("region", { name: "顧客情報" })).toContainText(
    "福岡県福岡市中央区天神3-3-3",
  );
});

// テスト仕様書 E2E-15
test("既存の顧客と同じ名前で登録すると警告し、確認すると登録する", async ({ page }, testInfo) => {
  const name = uniqueName("重複確認", testInfo.project.name);
  const csrfToken = await loginAs(page, "u1@example.com");
  const created = await page.request.post("/api/v1/customers", {
    headers: { "X-CSRF-Token": csrfToken },
    data: { name },
  });
  expect(created.status()).toBe(201);

  await page.goto("/customers/new");
  await page.getByLabel("顧客名").fill(name);
  await page.getByRole("button", { name: "保存" }).click();
  const warning = page.getByRole("alert").filter({ hasText: "同じ名前の顧客が登録されています" });
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL("/customers/new");

  await warning.getByRole("button", { name: "同じ名前で保存する" }).click();
  await expect(page.getByText("顧客を登録しました")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // 同じ名前の顧客が2件になる
  await page.goto(`/customers?q=${encodeURIComponent(name)}`);
  await expect(main(page).getByText("全 2件中 1〜2件")).toBeVisible();
});

test("存在しない顧客を開くと「ページが見つかりません」を表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/customers/999999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ページが見つかりません");
});
