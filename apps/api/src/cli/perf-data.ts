// 性能テスト(テスト仕様書 NFR-04、05、13)のデータを入れる、消すコマンド。ステージングで使う(docs/performance.md)
//   pnpm --filter @nippo/api perf-data insert   50人×5年分のデータを入れる
//   pnpm --filter @nippo/api perf-data delete   入れたデータを消す
// 接続先は DATABASE_URL。性能テストのユーザーのパスワードは画面で入力する(端末がない場合は PERF_PASSWORD)
import { createInterface } from "node:readline/promises";
import { todayInJst } from "@nippo/shared";
import { hashPassword } from "../auth/password";
import { now } from "../clock";
import { createDb } from "../db";
import { countPerfData, deletePerfData, insertPerfData } from "../perf/perf-data";
import { createHiddenPrompt } from "./prompt";

const USAGE = "使い方: perf-data insert | perf-data delete";

const fail = (message: string): never => {
  throw new Error(message);
};

/** 接続先を表示し、yes と入力されたら続ける */
const confirm = async (question: string) => {
  if (!process.stdin.isTTY) fail("端末から実行してください(確認の入力ができません)");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} 続けるには yes と入力してください: `);
    if (answer.trim() !== "yes") fail("中止しました");
  } finally {
    rl.close();
  }
};

const readPassword = async (): Promise<string> => {
  const fromEnv = process.env.PERF_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) fail("端末から実行するか、PERF_PASSWORD で渡してください");
  const prompt = createHiddenPrompt();
  try {
    const password = await prompt.ask("性能テストのユーザーのパスワード(8文字以上): ");
    const confirmation = await prompt.ask("パスワード(確認): ");
    if (password !== confirmation) fail("パスワードが一致しません");
    return password;
  } finally {
    prompt.close();
  }
};

const yesterday = () => {
  const date = new Date(`${todayInJst(now())}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

const main = async () => {
  const command = process.argv[2];
  if (command !== "insert" && command !== "delete") fail(USAGE);
  const url = process.env.DATABASE_URL ?? fail("DATABASE_URL が設定されていません");
  // 接続先のホスト名とデータベース名だけを表示する(パスワードは表示しない)
  const { hostname, pathname } = new URL(url);
  const target = `接続先: ${hostname}${pathname}`;
  const progress = (message: string) => process.stdout.write(`${message}\n`);

  const db = createDb(url);
  try {
    if (command === "insert") {
      await confirm(`${target} に、性能テストのデータ(50人×5年分)を入れます。`);
      const password = await readPassword();
      if (password.length < 8) fail("パスワードは8文字以上にしてください");
      const started = Date.now();
      const summary = await insertPerfData(db, {
        passwordHash: await hashPassword(password),
        lastDate: yesterday(),
        onProgress: progress,
      });
      progress(
        `入れました(${Math.round((Date.now() - started) / 1000)}秒): ${JSON.stringify(summary)}`,
      );
    } else {
      const counts = await countPerfData(db);
      await confirm(
        `${target} から、性能テストのデータ(ユーザー ${counts.users}人、顧客 ${counts.customers}件、日報 ${counts.reports}件)を消します。元に戻せません。`,
      );
      await deletePerfData(db, progress);
      progress(`消しました: ${JSON.stringify(await countPerfData(db))}`);
    }
  } finally {
    await db.$disconnect();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // pnpm のエラー表示(ERR_PNPM_...)に埋もれないよう、目印を付けて出す
  process.stderr.write(`\n[perf-data] エラー: ${message}\n\n`);
  process.exitCode = 1;
});
