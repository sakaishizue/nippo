import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../..", import.meta.url));

/** データベースを使うテストの前に一度だけ、テスト用データベースにマイグレーションを適用する */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL が設定されていません");
  execSync("pnpm exec prisma migrate deploy", {
    cwd: apiDir,
    env: { ...process.env, DIRECT_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
