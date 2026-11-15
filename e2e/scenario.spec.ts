import { expect, type Page, test } from "@playwright/test";
import {
  asAdmin,
  csrfHeaders,
  heading,
  loginAs,
  monthDay,
  PASSWORD,
  todayInJapan,
} from "./helpers";

// 複数の画面とロールをまたぐ業務シナリオ(テスト仕様書 5章)
// 今日の日報を作るため、シードのユーザー(U1 は今日の日報がない前提の画面テストがある)は使わず、
// 実行ごとに上長と一般を1組登録して使い、最後に無効にする。日報、通知、承認待ちが他のテストや前回の実行と混ざらない

/** 実行ごとに、上長と、その部下の一般を登録する */
const registerTeam = async (page: Page, projectName: string) => {
  const admin = await asAdmin(page);
  const suffix = `${projectName}-${Date.now()}`;
  const register = async (data: Record<string, unknown>) => {
    const res = await page.request.post("/api/v1/users", {
      ...admin,
      data: { password: PASSWORD, is_active: true, ...data },
    });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: number; email: string };
  };
  const manager = await register({
    name: "検証 上長",
    email: `e2e-manager-${suffix}@example.com`,
    role: "manager",
  });
  const member = await register({
    name: "検証 担当",
    email: `e2e-member-${suffix}@example.com`,
    role: "member",
    manager_id: manager.id,
  });
  registered.push(member.id, manager.id);
  return { manager: manager.email, member: member.email, suffix };
};

/** 登録したユーザー。部下がいる上長は無効にできないため、一般、上長の順に入れる */
const registered: number[] = [];

// 登録したユーザーは、テストの後に無効にする。ユーザー一覧(有効なユーザーだけを表示)に溜まらないように
test.afterEach(async ({ request }) => {
  const admin = await asAdmin(request);
  for (const id of registered.splice(0)) {
    const res = await request.patch(`/api/v1/users/${id}`, {
      ...admin,
      data: { is_active: false },
    });
    expect(res.status()).toBe(200);
  }
});

const info = (page: Page) => page.getByRole("region", { name: "日報の情報" });
const workEntry = (page: Page, n: number) => page.getByRole("listitem", { name: `作業${n}` });
const notification = (page: Page, message: string) =>
  page.getByRole("list", { name: "通知一覧" }).getByRole("button", { name: new RegExp(message) });

// テスト仕様書 E2E-01
test("担当者がスマートフォンで日報を作って提出し、上長が通知から開いて承認し、担当者が通知とホームで確かめる", async ({
  page,
}, testInfo) => {
  test.slow();
  const { manager, member, suffix } = await registerTeam(page, testInfo.project.name);
  const today = todayInJapan();
  // 担当者はスマートフォンの幅、上長はブラウザーの種類の既定の幅で操作する
  const defaultViewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const smartphone = { width: 375, height: 812 };

  // 訪問先の顧客。シードの顧客に訪問を足すと、顧客の画面テストの最終訪問日が変わるため、実行ごとに作る
  const csrf = await loginAs(page, member);
  const customerName = `E2E顧客-${suffix}`;
  const customer = await page.request.post("/api/v1/customers", {
    headers: csrfHeaders(csrf),
    data: { name: customerName },
  });
  expect(customer.status()).toBe(201);

  // 1. 担当者がスマートフォンで、ホームから日報を作り、訪問と移動を入力して提出する
  await page.setViewportSize(smartphone);
  await page.goto("/");
  const todayReport = page.getByRole("region", { name: "今日の日報", exact: true });
  await expect(todayReport).toContainText("未作成");
  await todayReport.getByRole("link", { name: "作成する" }).click();
  await expect(heading(page)).toHaveText("日報作成");
  await expect(page.getByLabel("日付")).toHaveValue(today);

  const visit = workEntry(page, 1);
  await expect(visit.getByLabel("作業区分")).toHaveValue("visit");
  await visit.getByLabel("時間(分)").fill("90");
  const customerInput = visit.getByRole("combobox", { name: "顧客" });
  await customerInput.fill(customerName);
  await page.getByRole("option", { name: new RegExp(`^${customerName}`) }).click();
  await expect(customerInput).toHaveValue(customerName);
  await visit.getByLabel("面談相手").fill("田中部長");
  await visit.getByLabel("訪問内容").fill("新サービスの提案");

  await page.getByRole("button", { name: "作業を追加" }).click();
  const travel = workEntry(page, 2);
  await travel.getByLabel("作業区分").selectOption("移動");
  await travel.getByLabel("時間(分)").fill("30");
  await expect(page.getByText(/^合計時間/)).toHaveText(/2時間/);

  await page.getByLabel("所感").fill("提案資料の反応がよかった");
  await page.getByLabel("翌日の予定").fill("見積を送る");
  await page.getByRole("button", { name: "提出", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: /提出すると編集できなくなります/ })
    .getByRole("button", { name: "提出する" })
    .click();
  await expect(page.getByText("日報を提出しました")).toBeVisible();
  await expect(page).toHaveURL(/\/reports\/\d+$/);
  const reportUrl = new URL(page.url()).pathname;
  await expect(info(page)).toContainText("提出済み");

  // 2. 上長が通知から日報詳細を開いて承認する
  await page.setViewportSize(defaultViewport);
  await loginAs(page, manager);
  await page.goto("/notifications");
  const submitted = notification(page, `検証さんが${monthDay(today)}の日報を提出しました`);
  await expect(submitted).toHaveAccessibleName(/^未読/);
  await submitted.click();
  await expect(page).toHaveURL(reportUrl);
  await expect(info(page)).toContainText("提出済み");
  await expect(info(page)).toContainText("検証 担当");
  await page.getByRole("button", { name: "承認", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "この日報を承認しますか?" })
    .getByRole("button", { name: "承認する" })
    .click();
  await expect(page.getByText("日報を承認しました")).toBeVisible();
  await expect(info(page)).toContainText("承認済み");

  // 3. 担当者が通知を確かめ、ホームの今日の日報が「承認済み」になっている
  await page.setViewportSize(smartphone);
  await loginAs(page, member);
  await page.goto("/notifications");
  const approved = notification(page, `${monthDay(today)}の日報が承認されました`);
  await expect(approved).toHaveAccessibleName(/^未読/);
  await approved.click();
  await expect(page).toHaveURL(reportUrl);
  await expect(info(page)).toContainText("承認済み");
  await expect(page.getByRole("list", { name: "承認履歴" })).toContainText("検証 上長");

  await page.goto("/");
  await expect(todayReport).toContainText("承認済み");
  await expect(todayReport.getByRole("link", { name: "続きを書く" })).toHaveCount(0);
});
