import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

// SCR-15 ユーザー一覧、SCR-16 ユーザー登録・編集。ユーザーはテスト仕様書 3章(開発用のシード)
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

/** 一覧(PC の表、スマホのカード)で、氏名のリンクを選ぶ */
const userLink = (page: Page, name: string) =>
  page.getByRole("main").getByRole("link", { name }).filter({ visible: true }).first();

test.describe("ユーザー一覧", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "a1@example.com");
  });

  test("有効なユーザーを表示し、無効なユーザーは状態を変えて検索すると表示する", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ユーザー一覧");
    await expect(userLink(page, "山田 太郎")).toBeVisible();
    await expect(page.getByText("伊藤 四郎")).toHaveCount(0);

    await page.getByLabel("状態").selectOption("無効");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL("/admin/users?is_active=false");
    await expect(userLink(page, "伊藤 四郎")).toBeVisible();
    await expect(page.getByText("山田 太郎")).toHaveCount(0);
  });

  test("氏名とロールで検索し、詳細から戻ると検索条件と結果を再現する", async ({ page }) => {
    await page.goto("/admin/users");
    await page.getByLabel("氏名、メールアドレス").fill("u1@");
    await page.getByLabel("ロール").selectOption("一般");
    await page.getByRole("button", { name: "検索" }).click();
    await expect(page).toHaveURL("/admin/users?q=u1%40&role=member");
    await expect(userLink(page, "山田 太郎")).toBeVisible();
    await expect(page.getByText("佐藤 花子")).toHaveCount(0);

    await userLink(page, "山田 太郎").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ユーザー編集");
    await page.goBack();
    await expect(page.getByLabel("氏名、メールアドレス")).toHaveValue("u1@");
    await expect(page.getByLabel("ロール")).toHaveValue("member");
    await expect(userLink(page, "山田 太郎")).toBeVisible();
  });

  test.describe("PC", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("一覧は表で、上長は一般のユーザーだけ表示する", async ({ page }) => {
      await page.goto("/admin/users");
      const table = page.getByRole("table", { name: "ユーザー一覧" });
      await expect(table.getByRole("columnheader")).toHaveText([
        "氏名",
        "メールアドレス",
        "ロール",
        "上長",
        "状態",
      ]);
      await expect(table.getByRole("row", { name: /山田 太郎/ })).toContainText("鈴木 一郎");
      const manager = table.getByRole("row", { name: /鈴木 一郎.*m1@example.com/ });
      await expect(manager.getByRole("cell").nth(3)).toHaveText("");
    });
  });

  test.describe("スマートフォン", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("一覧はカードで表示し、横スクロールが出ない", async ({ page }) => {
      await page.goto("/admin/users");
      await expect(page.getByRole("list", { name: "ユーザー一覧" })).toBeVisible();
      await expect(page.getByRole("table")).toBeHidden();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
});

test("一般のユーザーがユーザー一覧を開くと、エラー画面(403)を表示する", async ({ page }) => {
  await loginAs(page, "u1@example.com");
  await page.goto("/admin/users/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "この画面を表示する権限がありません",
  );
});

test("上長の選択欄は、ロールが一般のときだけ表示する", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users/new");
  await expect(page.getByLabel("上長")).toBeVisible();
  await page.getByLabel("ロール").selectOption("上長");
  await expect(page.getByLabel("上長")).toHaveCount(0);
  await page.getByLabel("ロール").selectOption("一般");
  await expect(page.getByLabel("上長")).toBeVisible();
});

test("登録で未入力の項目には、項目の下にエラーを表示する", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users/new");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("氏名を入力してください")).toBeVisible();
  await expect(page.getByText("一般のユーザーには上長を選んでください")).toBeVisible();
  await expect(page.getByText("パスワードを入力してください")).toBeVisible();
  await expect(page).toHaveURL("/admin/users/new");
});

test("同じメールアドレスのユーザーは登録できず、項目の下にエラーを表示する", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users/new");
  await page.getByLabel("氏名").fill("重複 確認");
  await page.getByLabel("メールアドレス").fill("u1@example.com");
  await page.getByLabel("上長").selectOption("鈴木 一郎");
  await page.getByLabel("パスワード").fill("password123");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("このメールアドレスは既に登録されています")).toBeVisible();
});

// 受け入れ条件: ユーザーを登録し、そのユーザーでログインできる。テストのたびにユーザーを作り、最後に無効にする
test("ユーザーを登録して編集し、そのユーザーでログインできる", async ({
  page,
  request,
}, testInfo) => {
  // ログイン、パスワードのハッシュ化、画面の移動が多く、WebKit では30秒を超えることがあるため
  test.slow();
  const email = `e2e-users-${testInfo.project.name}-${Date.now()}@example.com`;
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "新規登録" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ユーザー登録");

  await page.getByLabel("氏名").fill("登録 確認");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("ロール").selectOption("一般");
  await page.getByLabel("上長").selectOption("鈴木 一郎");
  await page.getByLabel("パスワード").fill("first-pass1");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("ユーザーを登録しました")).toBeVisible();
  await expect(page).toHaveURL("/admin/users");

  try {
    // 編集: 氏名を変え、パスワードを再設定する
    await page.getByLabel("氏名、メールアドレス").fill(email);
    await page.getByRole("button", { name: "検索" }).click();
    await userLink(page, "登録 確認").click();
    await expect(page.getByLabel("メールアドレス")).toHaveValue(email);
    await expect(page.getByLabel("パスワードの再設定")).toHaveValue("");
    await page.getByLabel("氏名").fill("登録 確認2");
    await page.getByLabel("パスワードの再設定").fill("second-pass2");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("ユーザーを保存しました")).toBeVisible();
    await expect(userLink(page, "登録 確認2")).toBeVisible();

    // ログアウトして、登録したユーザーの再設定後のパスワードでログインする
    await openMenu(page);
    await page.getByRole("button", { name: "ログアウト" }).filter({ visible: true }).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード").fill("second-pass2");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL("/");
    await openMenu(page);
    await expect(
      page.getByRole("link", { name: /登録 確認2/ }).filter({ visible: true }),
    ).toBeVisible();
  } finally {
    const admin = await asAdmin(request);
    const found = await request.get(`/api/v1/users?q=${encodeURIComponent(email)}`);
    const { items } = (await found.json()) as { items: { id: number }[] };
    for (const { id } of items) {
      await request.patch(`/api/v1/users/${id}`, { ...admin, data: { is_active: false } });
    }
  }
});

test("自分自身のロールは変更できず、API のエラーを画面に表示する", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users?role=admin");
  await userLink(page, "管理 太郎").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ユーザー編集");
  await page.getByLabel("ロール").selectOption("上長");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("alert")).toHaveText("自分自身のロールの変更と無効化はできません");
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
});

test("日報が残っている一般のロールを変えるときは、確認を求める", async ({ page }) => {
  await loginAs(page, "a1@example.com");
  await page.goto("/admin/users?q=u1%40");
  await userLink(page, "山田 太郎").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ユーザー編集");
  await page.getByLabel("ロール").selectOption("上長");
  await page.getByRole("button", { name: "保存" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("このユーザーには日報が残っています。ロールを変更しますか?");

  // キャンセルすると保存せず、編集画面に留まる
  await dialog.getByRole("button", { name: "キャンセル" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
  await page.reload();
  await expect(page.getByLabel("ロール")).toHaveValue("member");
});
