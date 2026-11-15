import { defineConfig, devices } from "@playwright/test";

// 性能テスト(テスト仕様書 NFR-04、05、13)の測定。ステージングに性能テストのデータを入れてから、手元の PC で実行する。
// 手順は docs/performance.md。通常の画面テスト(pnpm test:e2e)には含めない
const baseURL = process.env.PERF_BASE_URL;
if (!baseURL) throw new Error("PERF_BASE_URL(ステージングのURL)を指定してください");

export default defineConfig({
  testDir: ".",
  // 測定が重ならないよう、1つずつ順に実行する
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 10 * 60 * 1000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [
    // 通常の表示(NFR-04、05)
    { name: "warm", grepInvert: /@cold/ },
    // Cloud Run と Neon が停止した状態からの最初の表示(NFR-13)。停止を待ってから、これだけを実行する
    { name: "cold", grep: /@cold/ },
  ],
});
