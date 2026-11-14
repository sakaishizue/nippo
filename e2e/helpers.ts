import { type APIRequestContext, expect, type Page } from "@playwright/test";

// 画面テストの共通処理。ユーザーとデータはテスト仕様書 3章(開発用のシード)

/** テストデータのユーザーのパスワード。全員同じ */
export const PASSWORD = "password123";

/** テスト仕様書 3.1 のユーザーのメールアドレス */
export const USERS = {
  A1: "a1@example.com",
  M1: "m1@example.com",
  M2: "m2@example.com",
  U1: "u1@example.com",
  U2: "u2@example.com",
  U3: "u3@example.com",
} as const;

/** 画面テストを実行するブラウザーの種類(playwright.config.ts の projects) */
const PROJECTS = ["desktop-chrome", "desktop-edge", "iphone-safari", "android-chrome"];

/**
 * API でログインし、更新系のリクエストに付ける CSRFトークンを返す。
 * page.request は画面と Cookie を共有するため、以降の画面はログイン済みで開く
 */
export const loginAs = async (target: Page | APIRequestContext, email: string) => {
  const request = "request" in target ? target.request : target;
  const res = await request.post("/api/v1/auth/login", { data: { email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { csrf_token: string }).csrf_token;
};

/** 更新系の API に付ける CSRFトークンのヘッダー */
export const csrfHeaders = (csrfToken: string) => ({ "X-CSRF-Token": csrfToken });

/** 管理者(A1)としてログインし、更新系の API に付けるヘッダーを返す */
export const asAdmin = async (target: Page | APIRequestContext) => ({
  headers: csrfHeaders(await loginAs(target, USERS.A1)),
});

/** 768px 未満(スマートフォン)では、ハンバーガーメニューを開く */
export const openMenu = async (page: Page) => {
  // 表示を待たずに isVisible() で判定すると、描画前に判定してしまうため、画面幅で決める
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) await page.getByRole("button", { name: "メニューを開く" }).click();
};

/** 画面タイトル */
export const heading = (page: Page) => page.getByRole("heading", { level: 1 });

let sequence = 0;
/**
 * 日報は1人1日1件で削除できないため、開発用のデータベースで何度実行しても重ならない過去の日付を返す。
 * 実行した時刻、ブラウザーの種類、呼んだ順から決める。
 * ファイルごとに `fromYear` を変え、約28年の範囲が他のファイルと重ならないようにする。
 * 使っている範囲: 日報入力 1910年〜、通知 1940年〜、承認・差し戻し 1970年〜。
 * シードの日報(2026年11月)と、作業時間集計や日報一覧の画面テストの期間には入らない
 */
export const uniquePastDate = (projectName: string, fromYear: number) => {
  const seconds = Math.floor(Date.now() / 1000) % 1300;
  sequence += 1;
  const offset = seconds * 8 + Math.max(0, PROJECTS.indexOf(projectName)) * 2 + (sequence % 2);
  return new Date(Date.UTC(fromYear, 0, 1 + offset)).toISOString().slice(0, 10);
};

/** 日本時間の今日(YYYY-MM-DD) */
export const todayInJapan = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

/** 通知文などの「11月6日」の形式 */
export const monthDay = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
};
