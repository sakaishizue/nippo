import { expect, type Locator, type Page, test } from "@playwright/test";

// SCR-04 日報入力。データはテスト仕様書 3章(開発用のシード)
// シードの日報は U1 の 11月2日(承認済み)、3日(差し戻し)、4日(提出済み)、5日(下書き)。U2 には日報がない
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const workEntry = (page: Page, n: number) => page.getByRole("listitem", { name: `作業${n}` });
const total = (page: Page) => page.getByText(/^合計時間/);

/** 新規作成を開く。U2 は日報がないため、今日の日付のまま入力画面になる */
const openNew = async (page: Page) => {
  await loginAs(page, "u2@example.com");
  await page.goto("/reports/new");
  await expect(heading(page)).toHaveText("日報作成");
};

/** 検索付きの選択欄で、名前を入力して候補から選ぶ */
const choose = async (page: Page, input: Locator, name: string) => {
  await input.fill(name.slice(0, 2));
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await expect(input).toHaveValue(name);
};

/**
 * 保存するテストで使う過去の日付。日報は1人1日1件で削除できないため、
 * 開発用のデータベースで何度実行しても重ならないように、実行した時刻とブラウザの種類から決める
 */
const PROJECTS = ["desktop-chrome", "desktop-edge", "iphone-safari", "android-chrome"];
const uniquePastDate = (projectName: string) => {
  // 2000年から約25年の範囲。1秒ごとに4日ずつ進め、ブラウザの種類で1日ずつずらす
  const seconds = Math.floor(Date.now() / 1000) % 2300;
  const date = new Date(
    Date.UTC(2000, 0, 1 + seconds * 4 + Math.max(0, PROJECTS.indexOf(projectName))),
  );
  return date.toISOString().slice(0, 10);
};

// テスト仕様書 E2E-04
test("訪問の詳細欄は、作業区分が「訪問」のときだけ表示する", async ({ page }) => {
  await openNew(page);
  const entry = workEntry(page, 1);
  await expect(entry.getByLabel("作業区分")).toHaveValue("visit");
  await expect(entry.getByRole("combobox", { name: "顧客" })).toBeVisible();
  await expect(entry.getByLabel("訪問内容")).toBeVisible();

  await entry.getByLabel("作業区分").selectOption("移動");
  await expect(entry.getByRole("combobox", { name: "顧客" })).toHaveCount(0);
  await expect(entry.getByLabel("訪問内容")).toHaveCount(0);

  // 戻すと、前の入力が残っている
  await entry.getByLabel("作業区分").selectOption("訪問");
  await expect(entry.getByLabel("訪問内容")).toBeVisible();
});

// テスト仕様書 E2E-05
test("訪問の顧客を選ぶと、商談の選択肢がその顧客の商談だけになる", async ({ page }) => {
  await openNew(page);
  const entry = workEntry(page, 1);
  await choose(page, entry.getByRole("combobox", { name: "顧客" }), "A株式会社");

  await entry.getByRole("combobox", { name: "商談" }).click();
  await expect(page.getByRole("option", { name: /^新サービス導入/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /^保守契約の更新/ })).toHaveCount(0);
  await page.getByRole("option", { name: /^新サービス導入/ }).click();
  await expect(entry.getByRole("combobox", { name: "商談" })).toHaveValue("新サービス導入");

  // 顧客を変えると、合わなくなった商談の選択を外す
  await choose(page, entry.getByRole("combobox", { name: "顧客" }), "B株式会社");
  await expect(entry.getByRole("combobox", { name: "商談" })).toHaveValue("");
});

// テスト仕様書 E2E-06
test("日報入力から顧客を登録すると、その顧客を選んだ状態で戻る", async ({ page }, testInfo) => {
  const name = `その場登録-${testInfo.project.name}-${Date.now()}`;
  await openNew(page);
  await workEntry(page, 1).getByRole("button", { name: "顧客を登録" }).click();
  const dialog = page.getByRole("dialog", { name: "顧客を登録" });
  await dialog.getByLabel("顧客名").fill(name);
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("顧客を登録しました")).toBeVisible();
  await expect(workEntry(page, 1).getByRole("combobox", { name: "顧客" })).toHaveValue(name);
});

test("訪問の行は、顧客を選ばないと保存できず、訪問内容がないと提出できない", async ({ page }) => {
  await openNew(page);
  const entry = workEntry(page, 1);
  await entry.getByLabel("時間(分)").fill("60");
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(entry.getByText("顧客を選択してください")).toBeVisible();

  await choose(page, entry.getByRole("combobox", { name: "顧客" }), "A株式会社");
  await page.getByLabel("所感").fill("所感");
  await page.getByLabel("翌日の予定").fill("翌日の予定");
  await page.getByRole("button", { name: "提出", exact: true }).click();
  await expect(entry.getByText("訪問内容を入力してください")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// テスト仕様書 E2E-07
test("作業の追加、削除、時間の変更で、合計時間をすぐに計算し直す", async ({ page }) => {
  await openNew(page);
  await expect(total(page)).toHaveText(/0分/);
  await workEntry(page, 1).getByLabel("時間(分)").fill("90");
  await expect(total(page)).toHaveText(/1時間30分/);

  await page.getByRole("button", { name: "作業を追加" }).click();
  await workEntry(page, 2).getByLabel("作業区分").selectOption("移動");
  await workEntry(page, 2).getByLabel("時間(分)").fill("60");
  await expect(total(page)).toHaveText(/2時間30分/);

  await workEntry(page, 1).getByLabel("時間(分)").fill("30");
  await expect(total(page)).toHaveText(/1時間30分/);

  await workEntry(page, 1).getByRole("button", { name: "作業1を削除" }).click();
  await expect(workEntry(page, 2)).toHaveCount(0);
  await expect(total(page)).toHaveText(/1時間/);
});

// テスト仕様書 E2E-08
test("入力途中でメニューから移動すると警告し、キャンセルすると入力が残る", async ({ page }) => {
  await openNew(page);
  await page.getByLabel("所感").fill("入力途中の所感");

  const goToReports = async () => {
    // スマートフォンでは、閉じていればハンバーガーメニューを開く(キャンセルした後は開いたまま)
    const openMenu = page.getByRole("button", { name: "メニューを開く" });
    if ((page.viewportSize()?.width ?? 1280) < 768 && (await openMenu.isVisible())) {
      await openMenu.click();
    }
    await page
      .getByRole("navigation", { name: "メニュー" })
      .filter({ visible: true })
      .getByRole("link", { name: "日報一覧" })
      .click();
  };
  await goToReports();
  const warning = page.getByRole("alertdialog", { name: /保存していない入力があります/ });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "キャンセル" }).click();
  await expect(page).toHaveURL("/reports/new");
  await expect(page.getByLabel("所感")).toHaveValue("入力途中の所感");

  await goToReports();
  await warning.getByRole("button", { name: "離れる" }).click();
  await expect(page).toHaveURL("/reports");
});

test("提出時のチェックに合わなければ、項目にエラーを表示し、確認ダイアログを出さない", async ({
  page,
}) => {
  await openNew(page);
  const entry = workEntry(page, 1);
  await entry.getByLabel("作業区分").selectOption("移動");
  await entry.getByLabel("時間(分)").fill("0");
  await page.getByRole("button", { name: "提出", exact: true }).click();
  // 保存の入力チェック
  await expect(entry.getByText("1以上の整数を入力してください")).toBeVisible();

  await entry.getByLabel("時間(分)").fill("60");
  await page.getByRole("button", { name: "提出", exact: true }).click();
  // 提出時のチェック
  await expect(page.getByText("所感を入力してください")).toBeVisible();
  await expect(page.getByText("翌日の予定を入力してください")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

// テスト仕様書 E2E-09 と、下書き保存
test("下書き保存した日報を編集して提出する。提出は確認ダイアログでキャンセルできる", async ({
  page,
}, testInfo) => {
  test.slow();
  await openNew(page);
  await page.getByLabel("日付").fill(uniquePastDate(testInfo.project.name));
  const entry = workEntry(page, 1);
  await entry.getByLabel("作業区分").selectOption("資料作成");
  await entry.getByLabel("時間(分)").fill("90");
  await entry.getByLabel("メモ").fill("見積書の作成");
  await page.getByRole("button", { name: "下書き保存" }).click();

  await expect(page.getByText("下書きを保存しました")).toBeVisible();
  await expect(page).toHaveURL(/\/reports\/\d+$/);
  const reportUrl = new URL(page.url()).pathname;

  await page.goto(`${reportUrl}/edit`);
  await expect(heading(page)).toHaveText("日報編集");
  await expect(entry.getByLabel("作業区分")).toHaveValue("document");
  await expect(entry.getByLabel("時間(分)")).toHaveValue("90");
  await expect(entry.getByLabel("メモ")).toHaveValue("見積書の作成");
  await page.getByLabel("所感").fill("更新に前向きだった");
  await page.getByLabel("翌日の予定").fill("見積を作る");

  await page.getByRole("button", { name: "提出", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: /提出すると編集できなくなります/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(confirm).toBeHidden();
  await expect(page).toHaveURL(`${reportUrl}/edit`);
  const id = reportUrl.split("/").at(-1);
  const draft = await page.request.get(`/api/v1/reports/${id}`);
  expect((await draft.json()).status).toBe("draft");

  await page.getByRole("button", { name: "提出", exact: true }).click();
  await confirm.getByRole("button", { name: "提出する" }).click();
  await expect(page.getByText("日報を提出しました")).toBeVisible();
  await expect(page).toHaveURL(reportUrl);
  const submitted = await page.request.get(`/api/v1/reports/${id}`);
  expect((await submitted.json()).status).toBe("submitted");
});

// テスト仕様書 E2E-10
test("日報がある日付を選ぶと、その日報の入力画面を開く", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/reports/new");
  await expect(heading(page)).toHaveText("日報作成");
  await page.getByLabel("日付").fill("2026-11-05");

  await expect(heading(page)).toHaveText("日報編集");
  await expect(page).toHaveURL(/\/reports\/\d+\/edit$/);
  await expect(page.getByLabel("日付")).toHaveValue("2026-11-05");
  await expect(workEntry(page, 1).getByLabel("時間(分)")).toHaveValue("60");
  await expect(workEntry(page, 1).getByLabel("訪問内容")).toHaveValue("見積書の説明");
});

test("差し戻し中の日報は、差し戻し理由を上部に表示し、日付を変更できない", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/reports/new");
  await expect(heading(page)).toHaveText("日報作成");
  await page.getByLabel("日付").fill("2026-11-03");

  await expect(heading(page)).toHaveText("日報編集");
  const reason = page.getByRole("region", { name: "差し戻されています" });
  await expect(reason).toContainText("訪問内容をもう少し具体的に");
  await expect(page.getByLabel("日付")).toBeDisabled();
});

test("提出済みの日報の編集を開くと、日報詳細に移動する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/reports/new");
  await expect(heading(page)).toHaveText("日報作成");
  await page.getByLabel("日付").fill("2026-11-04");
  await expect(page).toHaveURL(/\/reports\/\d+$/);
});

test.describe("スマートフォン", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("作業はカードで縦に並び、時間の欄は数字キーボード。下書き保存と提出は画面の下に固定する", async ({
    page,
  }) => {
    await openNew(page);
    await page.getByRole("button", { name: "作業を追加" }).click();
    const first = await workEntry(page, 1).boundingBox();
    const second = await workEntry(page, 2).boundingBox();
    expect(second?.y).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0) - 1);
    await expect(workEntry(page, 1).getByLabel("時間(分)")).toHaveAttribute("inputmode", "numeric");

    const submit = page.getByRole("button", { name: "提出", exact: true });
    const box = await submit.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(812 - 80);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
