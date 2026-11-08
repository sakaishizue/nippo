import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

// SCR-17 プロフィール。ユーザーはテスト仕様書 3章(開発用のシード)
const PASSWORD = "password123";

const loginAs = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(res.status()).toBe(200);
};

const openMenu = async (page: Page) => {
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) await page.getByRole("button", { name: "メニューを開く" }).click();
};

/** 管理者(A1)として API を呼ぶ。更新系には CSRFトークンを付ける */
const asAdmin = async (request: APIRequestContext) => {
  const login = await request.post("/api/v1/auth/login", {
    data: { email: "a1@example.com", password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  const { csrf_token: csrfToken } = (await login.json()) as { csrf_token: string };
  return { headers: { "X-CSRF-Token": csrfToken } };
};

test("登録内容を表示し、変更は管理者に依頼する旨を表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("プロフィール");
  const info = page.getByRole("region", { name: "登録内容" });
  await expect(info).toContainText("山田 太郎");
  await expect(info).toContainText("u1@example.com");
  await expect(info).toContainText("一般");
  await expect(info).toContainText("鈴木 一郎");
  await expect(info).toContainText("登録内容の変更は、管理者に依頼してください。");
});

test("上長には上長の項目を表示しない", async ({ page }) => {
  await loginAs(page, "m1@example.com");
  await page.goto("/profile");
  const info = page.getByRole("region", { name: "登録内容" });
  await expect(info.locator("dt")).toHaveText(["氏名", "メールアドレス", "ロール"]);
  await expect(info.locator("dd").nth(2)).toHaveText("上長");
});

test("確認用が新しいパスワードと一致しなければ、項目の下にエラーを表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/profile");
  await page.getByLabel("現在のパスワード").fill(PASSWORD);
  await page.getByLabel("新しいパスワード", { exact: true }).fill("newpass123");
  await page.getByLabel("新しいパスワード(確認)").fill("newpass124");
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  await expect(page.getByText("新しいパスワードと一致しません")).toBeVisible();
});

test("現在のパスワードが誤っていれば、項目の下にエラーを表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/profile");
  await page.getByLabel("現在のパスワード").fill("wrong-password");
  await page.getByLabel("新しいパスワード", { exact: true }).fill("newpass123");
  await page.getByLabel("新しいパスワード(確認)").fill("newpass123");
  await page.getByRole("button", { name: "パスワードを変更" }).click();
  // API の 422 の details を、現在のパスワードの項目に表示する
  await expect(page.getByLabel("現在のパスワード")).toHaveAttribute("aria-invalid", "true");
});

// テスト仕様書 E2E-17。パスワードを変えるため、テストのたびにユーザーを作る(他のテストのユーザーに影響させない)
test("プロフィールでパスワードを変更すると、新しいパスワードでログインできる", async ({
  page,
  request,
}, testInfo) => {
  const admin = await asAdmin(request);
  const managers = await request.get("/api/v1/user-options?role=manager");
  const { items } = (await managers.json()) as { items: { id: number; name: string }[] };
  const managerId = items.find((item) => item.name === "鈴木 一郎")?.id;
  const email = `e2e-profile-${testInfo.project.name}-${Date.now()}@example.com`;
  const created = await request.post("/api/v1/users", {
    ...admin,
    data: {
      name: "プロフィール 確認",
      email,
      role: "member",
      manager_id: managerId,
      password: PASSWORD,
      is_active: true,
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: number };

  try {
    // 画面からログインして、ヘッダーのユーザー名からプロフィールを開く
    await page.goto("/login");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/");
    await openMenu(page);
    await page
      .getByRole("link", { name: /プロフィール 確認/ })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL("/profile");

    await page.getByLabel("現在のパスワード").fill(PASSWORD);
    await page.getByLabel("新しいパスワード", { exact: true }).fill("changed-pass1");
    await page.getByLabel("新しいパスワード(確認)").fill("changed-pass1");
    await page.getByRole("button", { name: "パスワードを変更" }).click();
    await expect(page.getByText("パスワードを変更しました")).toBeVisible();
    await expect(page.getByLabel("現在のパスワード")).toHaveValue("");

    // ログアウトして、古いパスワードではログインできず、新しいパスワードでログインできる
    await openMenu(page);
    await page.getByRole("button", { name: "ログアウト" }).filter({ visible: true }).click();
    await expect(page).toHaveURL("/login");

    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill(PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "メールアドレスまたはパスワードが正しくありません",
    );

    await page.getByLabel("パスワード").fill("changed-pass1");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/");
  } finally {
    // 作ったユーザーは無効にして、選択肢などに出ないようにする
    await request.patch(`/api/v1/users/${id}`, { ...admin, data: { is_active: false } });
  }
});
