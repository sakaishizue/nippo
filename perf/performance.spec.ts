import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type Request, test } from "@playwright/test";

// 性能テスト(テスト仕様書 NFR-04、05、13)。性能テストのデータ(apps/api の perf-data insert)のユーザーで、
// 画面を開いてから内容が表示されるまでの時間を測る。手順と結果は docs/performance.md

const password = process.env.PERF_PASSWORD;
if (!password) throw new Error("PERF_PASSWORD(性能テストのユーザーのパスワード)を指定してください");

const USERS = {
  member: "perf-u01@perf.example.com",
  manager: "perf-m01@perf.example.com",
  admin: "perf-admin@perf.example.com",
} as const;

/** 各画面を測る回数。1回目はブラウザーのキャッシュがないため、中央値で判定する */
const RUNS = 5;
const LIMIT_MS = 3000;

const login = async (page: Page, email: string) => {
  const res = await page.request.post("/api/v1/auth/login", { data: { email, password } });
  expect(res.status(), `${email} でログインできない`).toBe(200);
};

const apiGet = async <T>(page: Page, path: string): Promise<T> => {
  const res = await page.request.get(`/api/v1${path}`);
  expect(res.status(), path).toBe(200);
  return (await res.json()) as T;
};

/** 日本時間の今日から days 日ずらした日付 */
const dateInJapan = (days = 0) => {
  const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * 画面を開いてから、表示が終わるまでの時間(ミリ秒)。
 * 見出しが表示され、API の呼び出しがすべて終わり、「読み込み中…」が消えたときを表示の終わりとする
 */
const measure = async (page: Page, url: string): Promise<number> => {
  const inflight = new Set<Request>();
  const onRequest = (request: Request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) inflight.add(request);
  };
  const onDone = (request: Request) => {
    inflight.delete(request);
  };
  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);
  try {
    const started = Date.now();
    await page.goto(url);
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect
      .poll(
        async () =>
          inflight.size === 0 &&
          (await page.getByText("読み込み中…", { exact: true }).count()) === 0,
        { intervals: [20], timeout: 60_000 },
      )
      .toBe(true);
    return Date.now() - started;
  } finally {
    page.off("request", onRequest);
    page.off("requestfinished", onDone);
    page.off("requestfailed", onDone);
  }
};

type Row = { id: string; user: string; screen: string; times: number[] };
const rows: Row[] = [];
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const measureScreens = async (
  page: Page,
  id: string,
  user: string,
  screens: [screen: string, url: string][],
) => {
  for (const [screen, url] of screens) {
    const times: number[] = [];
    for (let i = 0; i < RUNS; i++) times.push(await measure(page, url));
    rows.push({ id, user, screen, times });
  }
};

/** 結果を表にして、画面と perf/results/ に出す */
const report = (title: string, lines: string[]) => {
  const text = [`## ${title}`, "", `測定日時: ${new Date().toISOString()}`, "", ...lines, ""].join(
    "\n",
  );
  process.stdout.write(`\n${text}\n`);
  // pnpm test:perf はリポジトリの直下で実行する
  const dir = join(process.cwd(), "perf", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(dir, `${stamp}.md`), text);
};

test.describe("通常の表示", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(() => {
    report("NFR-04、NFR-05", [
      `| ID | ユーザー | 画面 | 中央値 | 最大 | ${RUNS}回の結果(ミリ秒) |`,
      "| --- | --- | --- | --- | --- | --- |",
      ...rows.map(
        (row) =>
          `| ${row.id} | ${row.user} | ${row.screen} | ${(median(row.times) / 1000).toFixed(2)}秒 | ${(Math.max(...row.times) / 1000).toFixed(2)}秒 | ${row.times.join(", ")} |`,
      ),
    ]);
  });

  // テスト仕様書 NFR-04。主要画面(ホーム、日報一覧、日報詳細、顧客詳細、承認待ち一覧)
  test("NFR-04 主要画面を3秒以内に表示する", async ({ page }) => {
    await login(page, USERS.member);
    const { items } = await apiGet<{ items: { id: number }[] }>(page, "/reports?per_page=1");
    const reportId = items[0]?.id;
    const customers = await apiGet<{ items: { id: number }[] }>(
      page,
      `/customers?q=${encodeURIComponent("性能テスト顧客001")}`,
    );
    const customerId = customers.items[0]?.id;
    expect(reportId && customerId, "性能テストのデータがない").toBeTruthy();
    const fiveYears = `from=${dateInJapan(-5 * 365 - 2)}&to=${dateInJapan()}`;
    await measureScreens(page, "NFR-04", "一般", [
      ["ホーム", "/"],
      ["日報一覧(直近1か月)", "/reports"],
      ["日報一覧(5年分)", `/reports?${fiveYears}`],
      [
        "日報一覧(5年分をキーワードで検索)",
        `/reports?${fiveYears}&q=${encodeURIComponent("見積")}`,
      ],
      ["日報詳細", `/reports/${reportId}`],
      ["顧客詳細(訪問履歴)", `/customers/${customerId}`],
    ]);

    await login(page, USERS.manager);
    await measureScreens(page, "NFR-04", "上長", [
      ["ホーム", "/"],
      ["承認待ち一覧", "/approvals"],
      ["日報一覧(部下の5年分)", `/reports?${fiveYears}`],
    ]);

    await login(page, USERS.admin);
    await measureScreens(page, "NFR-04", "管理者", [
      ["日報一覧(全員の5年分)", `/reports?${fiveYears}`],
    ]);

    for (const row of rows.filter((r) => r.id === "NFR-04")) {
      expect(median(row.times), `${row.user}の${row.screen}`).toBeLessThanOrEqual(LIMIT_MS);
    }
  });

  // テスト仕様書 NFR-05。作業時間集計で、1年間、部下全員を集計する
  test("NFR-05 作業時間集計(1年間、部下全員)を3秒以内に表示する", async ({ page }) => {
    await login(page, USERS.manager);
    const oneYear = `from=${dateInJapan(-365 + 1)}&to=${dateInJapan()}`;
    await measureScreens(
      page,
      "NFR-05",
      "上長",
      (
        [
          ["user", "担当者別"],
          ["customer", "顧客別"],
          ["deal", "商談別"],
          ["category", "作業区分別"],
        ] as const
      ).map(([group, label]) => [
        `作業時間集計(${label})`,
        `/summary?${oneYear}&group_by=${group}`,
      ]),
    );
    for (const row of rows.filter((r) => r.id === "NFR-05")) {
      expect(median(row.times), row.screen).toBeLessThanOrEqual(LIMIT_MS);
    }
  });
});

// テスト仕様書 NFR-13。Cloud Run と Neon がどちらも停止した状態で、ログインしてホームを表示する。
// 3秒を超えても失敗にはせず、時間を記録する
test("NFR-13 停止した状態から、ログインしてホームを表示する時間", { tag: "@cold" }, async ({
  page,
}) => {
  const started = Date.now();
  await page.goto("/login");
  const loginButton = page.getByRole("button", { name: "ログイン" });
  await expect(loginButton).toBeVisible({ timeout: 120_000 });
  const loginShown = Date.now() - started;

  await page.getByLabel("メールアドレス").fill(USERS.member);
  await page.getByLabel("パスワード").fill(password);
  const submitted = Date.now();
  await loginButton.click();
  await expect(page.getByRole("main").getByText("今日の日報")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("読み込み中…", { exact: true })).toHaveCount(0, { timeout: 120_000 });
  const homeShown = Date.now() - submitted;

  const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}秒`;
  report("NFR-13", [
    "| 区間 | 時間 |",
    "| --- | --- |",
    `| ログイン画面を開いてから表示されるまで | ${seconds(loginShown)} |`,
    `| ログインしてからホームが表示されるまで | ${seconds(homeShown)} |`,
    `| 合計 | ${seconds(loginShown + homeShown)} |`,
  ]);
});
