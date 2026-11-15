import { expect, type Page, test } from "@playwright/test";
import { createSubmittedReport, csrfHeaders, heading, loginAs, USERS } from "./helpers";

// 非機能テストのうち、画面で確かめるもの(テスト仕様書 6章 NFR-01〜03、NFR-10)。データはテスト仕様書 3章(開発用のシード)
// NFR-07 は apps/api/src/auth/auth.db.test.ts、NFR-09 は API テストと apps/api/src/test-spec-coverage.test.ts で確かめる

const SMARTPHONE = { width: 375, height: 812 };

/** API の一覧の最初のID */
const firstId = async (page: Page, path: string) => {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);
  const { items } = (await res.json()) as { items: { id: number }[] };
  expect(items.length).toBeGreaterThan(0);
  return items[0]?.id;
};

/** U1 のシードの日報のID(11月4日は提出済み、5日は下書き) */
const u1ReportId = (page: Page, date: string) =>
  firstId(page, `/api/v1/reports?from=${date}&to=${date}`);

/** ロールごとに開く画面(画面定義書 1章の全画面。ID が要る画面はシードのデータを使う) */
const screensOf = async (page: Page, user: keyof typeof USERS) => {
  if (user === "U1") {
    const submitted = await u1ReportId(page, "2026-11-04");
    const draft = await u1ReportId(page, "2026-11-05");
    const customer = await firstId(page, "/api/v1/customers?q=A株式会社");
    const deal = await firstId(page, "/api/v1/deals?q=新サービス導入");
    return [
      "/",
      "/reports",
      "/reports/new",
      `/reports/${draft}/edit`,
      `/reports/${submitted}`,
      "/summary",
      "/customers",
      "/customers/new",
      `/customers/${customer}`,
      `/customers/${customer}/edit`,
      "/deals",
      "/deals/new",
      `/deals/${deal}`,
      `/deals/${deal}/edit`,
      "/notifications",
      "/profile",
      // 権限のない画面(403)と、定義していないURL
      "/admin/users",
      "/no-such-page",
    ];
  }
  if (user === "M1") {
    await loginAs(page, USERS.U1);
    const submitted = await u1ReportId(page, "2026-11-04");
    await loginAs(page, USERS.M1);
    return ["/", "/approvals", "/reports", `/reports/${submitted}`, "/summary", "/notifications"];
  }
  const target = await firstId(page, "/api/v1/users?q=u1@");
  return ["/admin/users", "/admin/users/new", `/admin/users/${target}`, "/reports", "/profile"];
};

/**
 * 高さ44px 未満のタップする要素(画面定義書 3.2)。
 * 文中のリンク(display が inline)は除く。検索付き選択欄の中のボタンは、選択欄の枠の高さで測る。
 * チェックボックスは、タップする範囲のラベルの高さで測る。部品が内部で使う見えない入力欄(1px 以下)は除く
 */
const smallTapTargets = (page: Page) =>
  page.evaluate(() => {
    const selector =
      "button, a[href], input:not([type=hidden]), select, textarea, [role=combobox], [role=tab]";
    const small: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const own = element.getBoundingClientRect();
      if (own.width <= 1 || own.height <= 1) continue;
      if (getComputedStyle(element).visibility === "hidden") continue;
      if (element.tagName === "A" && getComputedStyle(element).display === "inline") continue;
      const target =
        element.closest<HTMLElement>("[data-slot=input-group]") ??
        (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          ? element.closest("label")
          : null) ??
        element;
      const { height } = target.getBoundingClientRect();
      if (height < 44) {
        const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
        small.push(
          `${element.tagName.toLowerCase()} 「${name.trim().slice(0, 20)}」 ${Math.round(height)}px`,
        );
      }
    }
    return small;
  });

const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("スマートフォンの画面幅(375px)", () => {
  test.use({ viewport: SMARTPHONE });

  // テスト仕様書 NFR-01、NFR-02
  for (const user of ["U1", "M1", "A1"] as const) {
    test(`${user} の全画面で、横スクロールが出ず、タップする要素は高さ44px以上`, async ({
      page,
    }) => {
      test.slow();
      await loginAs(page, USERS[user]);
      for (const url of await screensOf(page, user)) {
        await page.goto(url);
        await expect(heading(page)).toBeVisible();
        await page.waitForLoadState("networkidle");
        expect(await horizontalOverflow(page), `${url} の横スクロール`).toBe(0);
        expect(await smallTapTargets(page), `${url} の44px 未満の要素`).toEqual([]);
      }
    });
  }

  test("ログイン画面で、横スクロールが出ず、タップする要素は高さ44px以上", async ({ page }) => {
    await page.goto("/login");
    await expect(heading(page)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
    expect(await smallTapTargets(page)).toEqual([]);
  });
});

// テスト仕様書 NFR-03。数値の入力欄は数字キーボード(inputmode="numeric")にする
test("時間(分)と見込金額の入力欄は、数字キーボードを表示する", async ({ page }) => {
  await loginAs(page, USERS.U2);
  await page.goto("/reports/new");
  await expect(page.getByLabel("時間(分)")).toHaveAttribute("inputmode", "numeric");
  await page.goto("/deals/new");
  await expect(page.getByLabel("見込金額(円)")).toHaveAttribute("inputmode", "numeric");
});

// テスト仕様書 NFR-10。入力した HTML はスクリプトとして実行せず、文字として表示する
test("入力欄に入れた HTML は、保存して表示しても実行されず、文字のまま表示する", async ({
  page,
}, testInfo) => {
  test.slow();
  const payload = `<script>window.__xss=1</script><img src=x onerror="window.__xss=1">`;
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  // U2 が、HTML を入れた顧客名、訪問内容、所感、コメントで日報を作って提出する
  const csrf = await loginAs(page, USERS.U2);
  // 顧客名は100文字以内のため、短い方の HTML を使う
  const customerName = `<img src=x onerror="window.__xss=1">-${testInfo.project.name}-${Date.now()}`;
  const customer = await page.request.post("/api/v1/customers", {
    headers: csrfHeaders(csrf),
    data: { name: customerName },
  });
  expect(customer.status()).toBe(201);
  const { id: customerId } = (await customer.json()) as { id: number };
  // 日報の日付は、他の画面テスト(1910年〜)と重ならないよう 1880年〜を使う
  const { id } = await createSubmittedReport(page, csrf, testInfo.project.name, 1880, {
    reflection: payload,
    next_plan: payload,
    work_entries: [
      {
        category: "visit",
        minutes: 30,
        deal_id: null,
        note: payload,
        visit: { customer_id: customerId, contact_name: null, content: payload, next_action: null },
      },
    ],
  });
  const comment = await page.request.post(`/api/v1/reports/${id}/comments`, {
    headers: csrfHeaders(csrf),
    data: { body: payload },
  });
  expect(comment.status()).toBe(201);

  const main = page.getByRole("main");
  const executed = () => page.evaluate(() => (window as { __xss?: number }).__xss);

  // 日報詳細: 所感、翌日の予定、メモ、訪問内容、コメント、顧客名
  await page.goto(`/reports/${id}`);
  await expect(main.getByText(payload, { exact: true }).first()).toBeVisible();
  expect(await main.getByText(payload, { exact: true }).count()).toBeGreaterThanOrEqual(5);
  await expect(main).toContainText(customerName);

  // 顧客詳細(顧客名と訪問履歴)と、顧客一覧
  await page.goto(`/customers/${customerId}`);
  await expect(heading(page)).toHaveText(customerName);
  await expect(main.getByText(payload, { exact: true }).first()).toBeVisible();
  await page.goto(`/customers?q=${encodeURIComponent(`-${testInfo.project.name}-`)}`);
  await expect(main.getByText(customerName).filter({ visible: true }).first()).toBeVisible();

  // HTML として解釈されていれば、img の要素ができ、スクリプトが動く
  expect(await main.locator("img[src='x']").count()).toBe(0);
  expect(await executed()).toBeUndefined();
  expect(dialogs).toEqual([]);
});
