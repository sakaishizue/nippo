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
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
    { name: "android-chrome", use: { ...devices["Pixel 7"] } },
  ],
  // 画面の開発サーバーを起動する。API とデータベースの起動は Issue #7 で追加する
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm --filter @nippo/web dev",
        url: "http://localhost:5173",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
