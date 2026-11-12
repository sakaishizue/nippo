import { expect, type Page, test } from "@playwright/test";

// SCR-05 日報詳細の承認、差し戻し、コメント。データはテスト仕様書 3章(開発用のシード)
// シードの日報を変えないよう、テストごとに U2(上長は M1)の日報を作って提出してから操作する
const PASSWORD = "password123";

/** API でログインし、更新系のリクエストに付ける CSRFトークンを返す */
const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { csrf_token: string }).csrf_token;
};

let sequence = 0;
/**
 * 日報は1人1日1件で削除できないため、実行した時刻、ブラウザの種類、テストの順から、重ならない過去の日付を決める。
 * 日報入力の画面テスト(2000〜2025年)と重ならないよう、1970〜1999年を使う
 */
const uniquePastDate = (projectName: string) => {
  const projects = ["desktop-chrome", "desktop-edge", "iphone-safari", "android-chrome"];
  const seconds = Math.floor(Date.now() / 1000) % 1300;
  sequence += 1;
  const offset = seconds * 8 + Math.max(0, projects.indexOf(projectName)) * 2 + (sequence % 2);
  return new Date(Date.UTC(1970, 0, 1 + offset)).toISOString().slice(0, 10);
};

/** U2 の日報を作って提出し、日付とIDを返す */
const submittedReportOfU2 = async (page: Page, projectName: string) => {
  const csrf = await loginAs(page, "u2@example.com");
  const headers = { "X-CSRF-Token": csrf };
  const date = uniquePastDate(projectName);
  const created = await page.request.post("/api/v1/reports", {
    headers,
    data: {
      report_date: date,
      reflection: "見積の条件を確認できた",
      next_plan: "見積書を作る",
      work_entries: [
        { category: "document", minutes: 60, deal_id: null, note: "見積の準備", visit: null },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: number };
  const submitted = await page.request.post(`/api/v1/reports/${id}/submit`, { headers });
  expect(submitted.status()).toBe(200);
  return { id, date };
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const info = (page: Page) => page.getByRole("region", { name: "日報の情報" });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("上長は確認ダイアログの後に承認できる", async ({ page }, testInfo) => {
  const { id } = await submittedReportOfU2(page, testInfo.project.name);
  await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${id}`);
  await expect(info(page)).toContainText("提出済み");

  await button(page, "承認").click();
  const confirm = page.getByRole("alertdialog", { name: "この日報を承認しますか?" });
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(info(page)).toContainText("提出済み");

  await button(page, "承認").click();
  await confirm.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByText("日報を承認しました")).toBeVisible();
  await expect(info(page)).toContainText("承認済み");
  await expect(page.getByRole("list", { name: "承認履歴" })).toContainText("鈴木 一郎");
  // 承認した後は、承認と差し戻しのボタンを出さない
  await expect(button(page, "承認")).toHaveCount(0);
  await expect(button(page, "差し戻し")).toHaveCount(0);
});

// テスト仕様書 E2E-03
test("差し戻し理由を空のまま差し戻すと、エラーを表示し、差し戻さない", async ({
  page,
}, testInfo) => {
  const { id } = await submittedReportOfU2(page, testInfo.project.name);
  await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${id}`);

  await button(page, "差し戻し").click();
  const dialog = page.getByRole("dialog", { name: "日報を差し戻す" });
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(dialog.getByText("差し戻し理由を入力してください")).toBeVisible();
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toBeHidden();
  await expect(info(page)).toContainText("提出済み");
});

// テスト仕様書 E2E-02
test("上長が理由を書いて差し戻し、担当者がホームの差し戻し一覧から開いて直し、再提出する", async ({
  page,
}, testInfo) => {
  test.slow();
  const { id, date } = await submittedReportOfU2(page, testInfo.project.name);
  const [y, m, d] = date.split("-").map(Number);
  const dateLabel = `${y}年${m}月${d}日`;

  // 1. M1 が理由を入力して差し戻す
  await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${id}`);
  await button(page, "差し戻し").click();
  const dialog = page.getByRole("dialog", { name: "日報を差し戻す" });
  await dialog.getByLabel("差し戻し理由").fill("見積の金額も書いてください");
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(page.getByText("日報を差し戻しました")).toBeVisible();
  await expect(info(page)).toContainText("差し戻し");

  // 2. U2 がホームの差し戻し一覧から開いて修正し、再提出する
  await loginAs(page, "u2@example.com");
  await page.goto("/");
  await page
    .getByRole("region", { name: "差し戻し中の日報", exact: true })
    .getByRole("link", { name: new RegExp(dateLabel) })
    .click();
  await expect(heading(page)).toHaveText("日報編集");
  // 日報入力の上部に差し戻し理由を表示する
  await expect(page.getByRole("region", { name: "差し戻されています" })).toContainText(
    "見積の金額も書いてください",
  );
  await page.getByLabel("所感").fill("見積の金額は100万円の見込み");
  await button(page, "提出").click();
  await page
    .getByRole("alertdialog", { name: /提出すると編集できなくなります/ })
    .getByRole("button", { name: "提出する" })
    .click();
  await expect(page).toHaveURL(`/reports/${id}`);
  await expect(info(page)).toContainText("提出済み");
  // 日報詳細の承認履歴に差し戻しが残る
  const reviews = page.getByRole("list", { name: "承認履歴" });
  await expect(reviews).toContainText("差し戻し");
  await expect(reviews).toContainText("見積の金額も書いてください");
});

test("担当者と上長はコメントを投稿でき、一覧に追加される", async ({ page }, testInfo) => {
  const { id } = await submittedReportOfU2(page, testInfo.project.name);
  await page.goto(`/reports/${id}`);
  const comments = page.getByRole("region", { name: "コメント", exact: true });
  // 本文は必須
  await comments.getByRole("button", { name: "投稿する" }).click();
  await expect(comments.getByText("コメントを入力してください")).toBeVisible();

  await comments.getByRole("textbox", { name: "コメント" }).fill("見積の前に確認をお願いします");
  await comments.getByRole("button", { name: "投稿する" }).click();
  await expect(page.getByText("コメントを投稿しました")).toBeVisible();
  const list = page.getByRole("list", { name: "コメント" });
  await expect(list).toContainText("佐藤 花子");
  await expect(list).toContainText("見積の前に確認をお願いします");
  await expect(comments.getByRole("textbox", { name: "コメント" })).toHaveValue("");

  await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${id}`);
  await comments.getByRole("textbox", { name: "コメント" }).fill("確認しました");
  await comments.getByRole("button", { name: "投稿する" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").last()).toContainText("鈴木 一郎");
});

test("他の操作で先に処理されていた場合は、メッセージを出して最新の状態を表示する", async ({
  page,
}, testInfo) => {
  const { id } = await submittedReportOfU2(page, testInfo.project.name);
  const csrf = await loginAs(page, "m1@example.com");
  await page.goto(`/reports/${id}`);
  await expect(info(page)).toContainText("提出済み");

  // 画面を開いたまま、別の操作(API)で先に承認する
  const approved = await page.request.post(`/api/v1/reports/${id}/approve`, {
    headers: { "X-CSRF-Token": csrf },
  });
  expect(approved.status()).toBe(200);

  await button(page, "差し戻し").click();
  const dialog = page.getByRole("dialog", { name: "日報を差し戻す" });
  await dialog.getByLabel("差し戻し理由").fill("やり直してください");
  await dialog.getByRole("button", { name: "差し戻す" }).click();
  await expect(page.getByText(/最新の状態を表示します/)).toBeVisible();
  await expect(info(page)).toContainText("承認済み");
  await expect(button(page, "差し戻し")).toHaveCount(0);
});

// テスト仕様書 E2E-12
test("管理者の日報詳細には、承認、差し戻し、編集のボタンとコメント欄を出さない", async ({
  page,
}) => {
  await loginAs(page, "a1@example.com");
  const res = await page.request.get(
    "/api/v1/reports?from=2026-11-04&to=2026-11-04&status=submitted",
  );
  const { items } = (await res.json()) as { items: { id: number; user: { name: string } }[] };
  const rSub = items.find((item) => item.user.name === "山田 太郎");
  expect(rSub).toBeDefined();
  await page.goto(`/reports/${rSub?.id}`);
  await expect(heading(page)).toHaveText("2026年11月4日(水)の日報");
  await expect(button(page, "承認")).toHaveCount(0);
  await expect(button(page, "差し戻し")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "編集" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "コメントの投稿" })).toHaveCount(0);
});

test("一般は自分の提出済みの日報に、承認と差し戻しのボタンを出さない", async ({
  page,
}, testInfo) => {
  const { id } = await submittedReportOfU2(page, testInfo.project.name);
  await page.goto(`/reports/${id}`);
  await expect(info(page)).toContainText("提出済み");
  await expect(button(page, "承認")).toHaveCount(0);
  await expect(page.getByRole("form", { name: "コメントの投稿" })).toBeVisible();
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("承認と差し戻しのボタンを画面の下に固定する", async ({ page }, testInfo) => {
    const { id } = await submittedReportOfU2(page, testInfo.project.name);
    await loginAs(page, "m1@example.com");
    await page.goto(`/reports/${id}`);
    const approve = await button(page, "承認").boundingBox();
    expect((approve?.y ?? 0) + (approve?.height ?? 0)).toBeGreaterThan(812 - 80);
    expect(approve?.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
