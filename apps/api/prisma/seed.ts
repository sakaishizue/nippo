// 開発用のデータベースに、テスト仕様書 3章と同じデータを入れる。`pnpm --filter @nippo/api db:seed`
import { createDb } from "../src/db";
import { log } from "../src/logger";
import { seedTestData } from "../src/testing/fixtures";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL が設定されていません");

const db = createDb(url);
try {
  // 入力済みのデータを消さないよう、ユーザーが1人でもいれば何もしない
  if ((await db.user.count()) > 0) {
    log("WARNING", "データベースにユーザーがいるため、シードを入れませんでした");
  } else {
    const data = await seedTestData(db);
    log("INFO", "シードを入れました", {
      users: Object.keys(data.users).length,
      customers: Object.keys(data.customers).length,
      deals: Object.keys(data.deals).length,
      reports: Object.keys(data.reports).length,
    });
  }
} finally {
  await db.$disconnect();
}
