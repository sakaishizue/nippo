import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
// ステージングに対して実行する場合は E2E_BASE_URL を指定する。その場合はアプリを起動しない
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : "html",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:5173",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // 失敗したテストのトレースとスクリーンショットを、HTML のレポートに含める
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
  ],
  // API と画面の開発サーバーを起動する。データベースの接続先は API の DATABASE_URL(apps/api/.env か環境変数)
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          name: "api",
          command: "pnpm --filter @nippo/api dev",
          url: "http://localhost:8080/api/v1/health",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
        {
          name: "web",
          command: "pnpm --filter @nippo/web dev",
          url: "http://localhost:5173",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      ],
});
