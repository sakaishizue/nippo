// データベースを使う API テスト(*.db.test.ts)の接続先を、Docker がない PC で起動するコマンド(#120)
//   pnpm --filter @nippo/api test-db
// Ctrl+C で止めるまで動く。接続先は .env.test の TEST_DATABASE_URL に書く(.env.test.example)
//
// データは保存しない(stateless)。テストは実行前にマイグレーションを適用し、テストごとに全データを消すため、
// 残す必要がない。保存する(stateful)と、全データを消すたびに prisma dev の変更の記録が増え続け、
// 数GBになって起動しなくなった(2026-11-22)。
// prisma dev の CLI ではなく、リポジトリに入れた @prisma/dev を直接使う。CLI は別の版を取ってきて、
// 起動中のまま止まることがあったため
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { startPrismaDevServer } from "@prisma/dev";

const NAME = "nippo-test";

/** .env.test.example の TEST_DATABASE_URL のポート(51222)と合わせる */
const PORTS = { port: 51221, databasePort: 51222, shadowDatabasePort: 51223, streamsPort: 51224 };

/** @prisma/dev がデータを置くフォルダ(env-paths の "prisma-dev" と同じ場所) */
const prismaDevDataDir = () => {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(localAppData, "prisma-dev-nodejs", "Data");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "prisma-dev-nodejs");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "prisma-dev-nodejs");
};

/**
 * 前回の変更の記録(durable-streams/nippo-test.<ランダムな値>)を消す。
 * Ctrl+C で止めれば @prisma/dev が消すが、端末を閉じるなどで強制終了すると残るため
 */
const removeLeftoverStreams = async () => {
  const dir = join(prismaDevDataDir(), "durable-streams");
  const entries = await readdir(dir).catch(() => []);
  for (const entry of entries) {
    if (entry.startsWith(`${NAME}.`)) await rm(join(dir, entry), { recursive: true, force: true });
  }
};

await removeLeftoverStreams();
const server = await startPrismaDevServer({
  name: NAME,
  persistenceMode: "stateless",
  ...PORTS,
});

process.stdout.write(
  [
    "テスト用のデータベースを起動しました。Ctrl+C で止めます",
    `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:${PORTS.databasePort}/template1?sslmode=disable`,
    "",
  ].join("\n"),
);

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
