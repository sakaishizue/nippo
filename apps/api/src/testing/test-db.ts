import { createDb } from "../db";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL が設定されていません");

/** データベースを使うテスト(*.db.test.ts)で共通に使う、テスト用データベースのクライアント */
export const testDb = createDb(url);
