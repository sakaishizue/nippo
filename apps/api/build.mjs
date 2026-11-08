// API を esbuild で dist/server.js の1ファイルにまとめる。`pnpm --filter @nippo/api build`
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  outfile: "dist/server.js",
  // ネイティブモジュール(.node)はまとめられないため、実行時に node_modules から読み込む
  external: ["@node-rs/argon2"],
  // CommonJS のパッケージ(pg など)が require() で Node.js の標準モジュールを読めるようにする
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
