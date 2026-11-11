import { expect, type Page, test } from "@playwright/test";

// SCR-02 ホーム。データはテスト仕様書 3章(開発用のシード)
// U1 の日報: 11月2日(承認済み)、3日(差し戻し)、4日(提出済み)、5日(下書き)。今日の日報はない
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("一般のホームに、今日の日報、差し戻し中の日報、最近の日報を表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/");
  await expect(heading(page)).toHaveText("ホーム");

  // 今日の日報は未作成のため「作成する」
  const today = region(page, "今日の日報");
  await expect(today).toContainText("未作成");
  await expect(today.getByRole("link", { name: "作成する" })).toHaveAttribute(
    "href",
    "/reports/new",
  );

  // 差し戻し中の日報は、日付と理由。選ぶと日報入力を開く
  const returned = region(page, "差し戻し中の日報");
  const row = returned.getByRole("link", { name: /2026年11月3日/ });
  await expect(row).toContainText("訪問内容をもう少し具体的に");
  // 最近の日報は今日から7日分のため、実行する日によって変わる。見出しだけ確認する
  await expect(region(page, "最近の日報")).toBeVisible();

  await row.click();
  await expect(page).toHaveURL(/\/reports\/\d+\/edit$/);
  await expect(heading(page)).toHaveText("日報編集");
});

test("上長のホームに、承認待ちの件数と部下の提出状況を表示する", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/");
  await expect(heading(page)).toHaveText("ホーム");

  // 件数は他の画面テストが提出した日報で変わるため、1件以上(シードの R-sub)を確認する
  const pending = region(page, "承認待ち");
  await expect(pending).toContainText(/[1-9]\d* 件/);

  // 有効な部下だけ(X1 は無効のため出さない)
  const table = page.getByRole("table", { name: "部下の提出状況" });
  await expect(table.getByRole("rowheader")).toHaveText(["山田 太郎", "佐藤 花子"]);
  await expect(table).not.toContainText("伊藤 四郎");

  await pending.getByRole("link", { name: "承認待ち一覧へ" }).click();
  await expect(page).toHaveURL("/approvals");
});

test("管理者がホームを開くと、ユーザー一覧に移動する", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/");
  await expect(page).toHaveURL("/admin/users");
  await expect(heading(page)).toHaveText("ユーザー一覧");
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("横スクロールが出ない", async ({ page }) => {
    await loginAs(page, "m1@example.com");
    await page.goto("/");
    await expect(page.getByRole("table", { name: "部下の提出状況" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
