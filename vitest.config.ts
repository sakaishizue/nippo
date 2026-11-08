import { existsSync } from "node:fs";
import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";

// データベースを使うテスト(*.db.test.ts)の接続先。apps/api/.env.test か環境変数 TEST_DATABASE_URL で指定する
const envTestFile = "apps/api/.env.test";
if (existsSync(envTestFile)) process.loadEnvFile(envTestFile);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  // CI ではデータベースを使うテストを必ず実行する。ローカルでは未設定なら飛ばす
  if (process.env.CI) throw new Error("CI では TEST_DATABASE_URL の設定が必要です");
  console.warn(
    "TEST_DATABASE_URL が未設定のため、データベースを使うテスト(*.db.test.ts)は実行しません",
  );
}

const apiDbProject: TestProjectInlineConfiguration = {
  test: {
    name: "api-db",
    include: ["apps/api/src/**/*.db.test.ts"],
    environment: "node",
    globalSetup: ["apps/api/src/testing/global-setup.ts"],
    setupFiles: ["apps/api/src/testing/setup-db.ts"],
    // 1つのデータベースを全テストで使い、テストごとに空にするため、ファイルを並列に実行しない
    fileParallelism: false,
  },
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["apps/*/src/**/*.test.ts", "packages/*/src/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
          environment: "node",
        },
      },
      ...(testDatabaseUrl ? [apiDbProject] : []),
    ],
    coverage: {
      provider: "v8",
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "apps/api/src/testing/**"],
      reporter: ["text", "html"],
    },
  },
});
