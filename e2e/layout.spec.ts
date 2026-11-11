import { expect, type Page, test } from "@playwright/test";

// 共通レイアウト(画面定義書 3.1、3.2)。ユーザーはテスト仕様書 3章(開発用のシード)
const USERS = {
  A1: "a1@example.com",
  M1: "m1@example.com",
  U1: "u1@example.com",
} as const;
type User = keyof typeof USERS;

const loginAs = async (page: Page, user: User) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email: USERS[user], password: "password123" },
  });
  expect(res.status()).toBe(200);
};

/** 768px 未満(スマートフォン)では、ハンバーガーメニューを開く */
const openMenu = async (page: Page) => {
  // 表示を待たずに isVisible() で判定すると、描画前に判定してしまうため、画面幅で決める
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) await page.getByRole("button", { name: "メニューを開く" }).click();
};

const menuLinks = (page: Page) =>
  page.getByRole("navigation", { name: "メニュー" }).filter({ visible: true }).getByRole("link");

// テスト仕様書 E2E-11(ロール別のメニュー)
const menus: readonly (readonly [User, string, readonly string[]])[] = [
  ["U1", "/", ["ホーム", "日報一覧", "作業時間集計", "顧客", "商談"]],
  ["M1", "/", ["ホーム", "承認待ち", "日報一覧", "作業時間集計", "顧客", "商談"]],
  ["A1", "/admin/users", ["ユーザー管理", "日報一覧", "顧客", "商談"]],
];

for (const [user, home, labels] of menus) {
  test(`${user} のメニューは画面定義書 3.1 のとおり`, async ({ page }) => {
    await loginAs(page, user);
    await page.goto(home);
    await openMenu(page);
    await expect(menuLinks(page)).toHaveText(labels);
  });
}

test("一般と上長には未読の通知の件数を表示し、管理者には通知を表示しない", async ({ page }) => {
  await loginAs(page, "M1");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /^通知/ }).first()).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, "A1");
  await page.goto("/admin/users");
  await openMenu(page);
  await expect(page.getByRole("link", { name: /^通知/ })).toHaveCount(0);
});

test("メニューから画面を移動でき、選んだメニューが選択中になる", async ({ page }) => {
  await loginAs(page, "U1");
  await page.goto("/");
  await openMenu(page);
  await menuLinks(page).getByText("日報一覧").click();
  await expect(page).toHaveURL("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("日報一覧");

  await openMenu(page);
  await expect(menuLinks(page).getByText("日報一覧")).toHaveAttribute("aria-current", "page");
  await expect(menuLinks(page).getByText("ホーム")).not.toHaveAttribute("aria-current", "page");
});

test("ユーザー名からプロフィールに移動できる", async ({ page }) => {
  await loginAs(page, "U1");
  await page.goto("/");
  await openMenu(page);
  await page
    .getByRole("link", { name: /山田 太郎/ })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL("/profile");
});

test("ログアウトするとログイン画面に移動し、画面を開くとログイン画面に戻される", async ({
  page,
}) => {
  await loginAs(page, "U1");
  await page.goto("/reports");
  await openMenu(page);
  await page.getByRole("button", { name: "ログアウト" }).filter({ visible: true }).click();
  await expect(page).toHaveURL("/login");

  await page.goto("/reports");
  await expect(page).toHaveURL("/login?redirect=%2Freports");
});

test.describe("スマートフォンの画面幅(375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("メニューは折りたたまれ、ボタンで開閉できる", async ({ page }) => {
    await loginAs(page, "M1");
    await page.goto("/");
    await expect(menuLinks(page)).toHaveCount(0);

    await page.getByRole("button", { name: "メニューを開く" }).click();
    await expect(menuLinks(page)).toHaveCount(6);
    await page.getByRole("button", { name: "メニューを閉じる" }).click();
    await expect(menuLinks(page)).toHaveCount(0);

    // Esc でも閉じる
    await page.getByRole("button", { name: "メニューを開く" }).click();
    await page.keyboard.press("Escape");
    await expect(menuLinks(page)).toHaveCount(0);
  });

  // テスト仕様書 NFR-01(一覧のカード表示は各画面の Issue で確認する)
  for (const [user, path] of [
    ["U1", "/"],
    ["M1", "/approvals"],
    ["A1", "/admin/users"],
    ["U1", "/admin/users"],
  ] as const) {
    test(`${user} で ${path} を開いても横スクロールが出ない`, async ({ page }) => {
      await loginAs(page, user);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.getByRole("button", { name: "メニューを開く" }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

  test("ヘッダーのボタンとリンクは高さ44px以上", async ({ page }) => {
    await loginAs(page, "U1");
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();
    const targets = page
      .locator("header")
      .getByRole("link")
      .or(page.locator("header").getByRole("button"));
    for (const target of await targets.filter({ visible: true }).all()) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0, (await target.textContent()) ?? "").toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("PCの画面幅(1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("メニューを横に並べ、ハンバーガーメニューは出さない", async ({ page }) => {
    await loginAs(page, "M1");
    await page.goto("/");
    await expect(menuLinks(page)).toHaveCount(6);
    await expect(page.getByRole("button", { name: "メニューを開く" })).toBeHidden();
  });
});
