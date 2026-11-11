import { expect, type Page, test } from "@playwright/test";

// SCR-05 日報詳細。データはテスト仕様書 3章(開発用のシード)
// U1 の日報: 11月2日(R-app、承認済み)、3日(R-ret、差し戻し)、4日(R-sub、提出済み)、5日(R-draft、下書き)
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

/** U1 の、指定した日付の日報のID(API の検索で探す) */
const reportIdOf = async (page: Page, date: string) => {
  const res = await page.request.get(`/api/v1/reports?from=${date}&to=${date}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { items: { id: number }[] };
  const id = body.items[0]?.id;
  expect(id).toBeDefined();
  return id as number;
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

// Issue #31 の受け入れ条件: U1 が自分の日報を開き、内容が表示される
test("自分の承認済みの日報を開くと、内容と承認履歴を表示する。編集ボタンは出さない", async ({
  page,
}) => {
  await loginAs(page, "u1@example.com");
  const id = await reportIdOf(page, "2026-11-02");
  await page.goto(`/reports/${id}`);

  await expect(heading(page)).toHaveText("2026年11月2日(月)の日報");
  const info = region(page, "日報の情報");
  await expect(info).toContainText("山田 太郎");
  await expect(info).toContainText("承認済み");
  await expect(info).toContainText("2026年11月2日(月) 18:00");

  const work = page.getByRole("list", { name: "作業" });
  await expect(work.getByRole("listitem")).toHaveCount(2);
  const visit = work.getByRole("listitem", { name: /作業1/ });
  await expect(visit).toContainText("訪問");
  await expect(visit).toContainText("1時間30分");
  await expect(visit.getByRole("link", { name: "A株式会社" })).toBeVisible();
  await expect(visit.getByRole("link", { name: "新サービス導入" })).toBeVisible();
  await expect(visit).toContainText("田中部長");
  await expect(visit).toContainText("新サービスの提案");
  await expect(visit).toContainText("来週までに見積を提示");
  await expect(work.getByRole("listitem", { name: /作業2/ })).toContainText("移動");
  await expect(page.getByText("合計時間 2時間30分")).toBeVisible();

  await expect(region(page, "所感")).toContainText("提案資料の反応がよかった");
  await expect(region(page, "翌日の予定")).toContainText("見積の準備");
  const reviews = page.getByRole("list", { name: "承認履歴" });
  await expect(reviews).toContainText("承認");
  await expect(reviews).toContainText("鈴木 一郎");
  await expect(reviews).toContainText("2026年11月2日(月) 19:00");
  await expect(region(page, "コメント")).toContainText("コメントはありません");

  await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);
});

test("差し戻しの日報は、承認履歴に差し戻しの理由を表示し、編集ボタンから入力画面へ移動できる", async ({
  page,
}) => {
  await loginAs(page, "u1@example.com");
  const id = await reportIdOf(page, "2026-11-03");
  await page.goto(`/reports/${id}`);

  await expect(region(page, "日報の情報")).toContainText("差し戻し");
  const reviews = page.getByRole("list", { name: "承認履歴" });
  await expect(reviews).toContainText("差し戻し");
  await expect(reviews).toContainText("訪問内容をもう少し具体的に");

  await page.getByRole("link", { name: "編集" }).click();
  await expect(page).toHaveURL(`/reports/${id}/edit`);
  await expect(heading(page)).toHaveText("日報編集");
});

test("下書きは提出日時を「未提出」と表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  const id = await reportIdOf(page, "2026-11-05");
  await page.goto(`/reports/${id}`);
  const info = region(page, "日報の情報");
  await expect(info).toContainText("下書き");
  await expect(info).toContainText("未提出");
  await expect(page.getByRole("link", { name: "編集" })).toBeVisible();
});

test("閲覧権限のない日報は「ページが見つかりません」を表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  const draft = await reportIdOf(page, "2026-11-05");
  const submitted = await reportIdOf(page, "2026-11-04");

  // 上長は部下の下書きを見られない(VIEW-06)
  await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${draft}`);
  await expect(heading(page)).toHaveText("ページが見つかりません");
  // 上長は部下の提出済みの日報を見られる。編集ボタンは出さない
  await page.goto(`/reports/${submitted}`);
  await expect(heading(page)).toHaveText("2026年11月4日(水)の日報");
  await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);

  // 他の一般は見られない(VIEW-05)
  await loginAs(page, "u2@example.com");
  await page.goto(`/reports/${submitted}`);
  await expect(heading(page)).toHaveText("ページが見つかりません");
});
