import { expect, type Page, test } from "@playwright/test";
import { createSubmittedReport, loginAs, monthDay } from "./helpers";

// SCR-14 通知一覧とヘッダーの未読数。データはテスト仕様書 3章(開発用のシード)
// 他の画面テストと通知が混ざらないよう、U3(田中 三郎)と、その上長の M2 を使う

/** U3 の日報を作って提出する(M2 に提出の通知が届く) */
const submitReportOfU3 = async (page: Page, projectName: string) => {
  const csrf = await loginAs(page, "u3@example.com");
  const { id, date } = await createSubmittedReport(page, csrf, projectName, 1940, {
    reflection: "定例の訪問",
    next_plan: "社内会議",
    work_entries: [{ category: "meeting", minutes: 30, deal_id: null, note: null, visit: null }],
  });
  return { id, message: `田中さんが${monthDay(date)}の日報を提出しました` };
};

/** ヘッダーの通知のリンク。名前は「通知(未読N件)」、未読がなければ「通知」 */
const unreadCount = async (page: Page) => {
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) return null;
  const label = await page
    .getByRole("banner")
    .getByRole("link", { name: /^通知/ })
    .getAttribute("aria-label");
  const match = /未読(\d+)件/.exec(label ?? "");
  return match ? Number(match[1]) : 0;
};

const notificationButton = (page: Page, message: string) =>
  page
    .getByRole("list", { name: "通知一覧" })
    .getByRole("button", { name: new RegExp(message) })
    .first();

// テスト仕様書 E2E-16
test("未読の通知を選ぶと、既読になり、対象の日報詳細へ移動する。未読数も減る", async ({
  page,
}, testInfo) => {
  const { id, message } = await submitReportOfU3(page, testInfo.project.name);
  await loginAs(page, "m2@example.com");
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("通知一覧");

  // 未読は太字で、名前の先頭に「未読」が付く
  const button = notificationButton(page, message);
  await expect(button).toHaveAccessibleName(new RegExp(`^未読 ${message}`));
  const before = await unreadCount(page);
  if (before !== null) expect(before).toBeGreaterThan(0);

  await button.click();
  await expect(page).toHaveURL(`/reports/${id}`);
  await expect(page.getByRole("region", { name: "日報の情報" })).toContainText("田中 三郎");
  if (before !== null) await expect.poll(() => unreadCount(page)).toBeLessThan(before);

  await page.goBack();
  await expect(notificationButton(page, message)).toHaveAccessibleName(new RegExp(`^${message}`));
});

test("「すべて既読にする」で、表示中の通知がすべて既読になる", async ({ page }, testInfo) => {
  const { message } = await submitReportOfU3(page, testInfo.project.name);
  await loginAs(page, "m2@example.com");
  await page.goto("/notifications");
  await expect(notificationButton(page, message)).toHaveAccessibleName(/^未読/);

  await page.getByRole("button", { name: "すべて既読にする" }).click();
  await expect(notificationButton(page, message)).toHaveAccessibleName(new RegExp(`^${message}`));
});

test("リマインドの通知から開く日報入力は、対象日を日付の初期値にする", async ({ page }) => {
  // リマインドの通知は定期処理が作るため、移動先の URL(/reports/new?date=)を直接開いて確かめる
  await loginAs(page, "u3@example.com");
  await page.goto("/reports/new?date=1939-06-01");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("日報作成");
  await expect(page.getByLabel("日付")).toHaveValue("1939-06-01");
});
