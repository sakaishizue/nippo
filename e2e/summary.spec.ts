import { expect, type Page, test } from "@playwright/test";

// SCR-07 作業時間集計。データはテスト仕様書 3章(開発用のシード)
// U1 の2026年11月の提出済みと承認済みの日報: 訪問180分(A株式会社、新サービス導入)、移動60分
// 他の画面テストが作る日報は1940〜2025年のため、2026年11月の集計には入らない
const PASSWORD = "password123";
const NOVEMBER = "from=2026-11-01&to=2026-11-30";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const table = (page: Page) => page.getByRole("table", { name: /作業時間の集計/ });
/** 集計結果の行を「項目名:時間:割合」にする */
const resultRows = async (page: Page) =>
  table(page)
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) => cell.textContent?.trim()).join(":"),
      ),
    );
const totalRow = (page: Page) => table(page).locator("tfoot tr");

// テスト仕様書 E2E-19
test("一般は集計の切り口を切り替えられ、表と横棒グラフが切り替わり、合計が一致する。担当者別は出さない", async ({
  page,
}) => {
  await loginAs(page, "u1@example.com");
  await page.goto(`/summary?${NOVEMBER}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("作業時間集計");

  const group = page.getByLabel("集計の切り口");
  await expect(group.locator("option")).toHaveText(["作業区分別", "顧客別", "商談別"]);
  await expect(page.getByRole("group", { name: "担当者" })).toHaveCount(0);

  // 作業区分別(一般の初期値)
  await expect(table(page)).toHaveAccessibleName("作業時間の集計(作業区分別)");
  await expect.poll(() => resultRows(page)).toEqual(["訪問:3時間:75.0%", "移動:1時間:25.0%"]);
  await expect(totalRow(page)).toHaveText(/合計\s*4時間/);

  // 顧客別に切り替えると、訪問以外の時間は未分類で最後
  await group.selectOption("顧客別");
  await page.getByRole("button", { name: "集計" }).click();
  await expect(page).toHaveURL(/group_by=customer/);
  await expect(table(page)).toHaveAccessibleName("作業時間の集計(顧客別)");
  await expect
    .poll(() => resultRows(page))
    .toEqual(["A株式会社:3時間:75.0%", "未分類:1時間:25.0%"]);
  await expect(totalRow(page)).toHaveText(/合計\s*4時間/);

  // 商談別
  await group.selectOption("商談別");
  await page.getByRole("button", { name: "集計" }).click();
  await expect
    .poll(() => resultRows(page))
    .toEqual(["新サービス導入:3時間:75.0%", "未分類:1時間:25.0%"]);
});

test("上長は担当者別が初期値。担当者は部下から複数選択でき、初期値は全員", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto(`/summary?${NOVEMBER}`);
  await expect(page.getByLabel("集計の切り口")).toHaveValue("user");
  await expect(table(page)).toHaveAccessibleName("作業時間の集計(担当者別)");
  await expect.poll(() => resultRows(page)).toEqual(["山田 太郎:4時間:100.0%"]);

  const users = page.getByRole("group", { name: "担当者" });
  await expect(users.getByRole("checkbox", { name: "山田 太郎" })).toBeChecked();
  await expect(users.getByRole("checkbox", { name: "佐藤 花子" })).toBeChecked();
  // 部下以外(U3)と無効な部下(X1)は選択肢に出さない
  await expect(users.getByRole("checkbox")).toHaveCount(2);

  await users.getByRole("checkbox", { name: "山田 太郎" }).uncheck();
  await page.getByRole("button", { name: "集計" }).click();
  await expect(page).toHaveURL(/user_id=\d+/);
  await expect(page.getByText(/集計の対象になる日報はありません/)).toBeVisible();
});

test("期間が1年を超えると、エラーを表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/summary?from=2025-01-01&to=2026-01-01");
  await expect(page.getByRole("alert")).toHaveText("期間は1年以内にしてください");
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "m1@example.com");
    await page.goto(`/summary?${NOVEMBER}&group_by=deal`);
    await expect(table(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
