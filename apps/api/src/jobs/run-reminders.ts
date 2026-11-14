import { createDb } from "../db";
import { loadEnv } from "../env";
import { log } from "../logger";
import { runReminders } from "./reminder";

// 未提出のリマインドの定期処理の入り口。Cloud Run ジョブで `node dist/reminder.js` として実行する
// (CI/CD 設定手順書 2.8)。ローカルでは `pnpm --filter @nippo/api reminder` で実行できる

const env = loadEnv();
const db = createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX);
try {
  const result = await runReminders(db, new Date());
  log("INFO", "未提出のリマインドを実行しました", result);
} catch (error) {
  log("ERROR", "未提出のリマインドに失敗しました", { error: String(error) });
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
