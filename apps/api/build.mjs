// API を esbuild でまとめる。`pnpm --filter @nippo/api build`
// - dist/server.js: API のサーバー(Cloud Run サービス)
// - dist/reminder.js: 未提出のリマインドの定期処理(Cloud Run ジョブ)
import { build } from "esbuild";

await build({
  entryPoints: { server: "src/server.ts", reminder: "src/jobs/run-reminders.ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  outdir: "dist",
  // ネイティブモジュール(.node)はまとめられないため、実行時に node_modules から読み込む
  external: ["@node-rs/argon2"],
  // CommonJS のパッケージ(pg など)が require() で Node.js の標準モジュールを読めるようにする
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
