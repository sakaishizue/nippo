import { afterAll, beforeEach } from "vitest";
import { setNow } from "../clock";
import { truncateAll } from "./reset";
import { testDb } from "./test-db";

// テストごとにデータを空にし、固定した日時も戻す。前のテストのデータや状態に結果が左右されないようにするため
beforeEach(async () => {
  setNow(null);
  await truncateAll(testDb);
});

afterAll(async () => {
  await testDb.$disconnect();
});
