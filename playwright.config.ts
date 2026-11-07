import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : "html",
  use: {
    // ステージングに対して実行する場合は E2E_BASE_URL を指定する
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
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
});
