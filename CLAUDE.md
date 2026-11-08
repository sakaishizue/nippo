# 営業日報システム

営業担当者の日報(訪問記録、作業時間)を記録し、上長が承認とコメントを行うWebシステム。

## コマンド

パッケージ管理は pnpm、リンターとフォーマッターは Biome(設定は `biome.json`)。

- `pnpm check`: リントと整形のチェック
- `pnpm check:fix`: 自動で直せる問題を修正
- `pnpm typecheck`: 型チェック(TypeScript 7)。ルートの設定ファイルと、各ワークスペースの `typecheck` スクリプトを実行する
- `pnpm test`: 単体テストとAPIテスト(Vitest)。テストは `apps/*/src`、`packages/*/src` に `*.test.ts` で置く
- `pnpm test:coverage`: カバレッジ付きで実行
- `pnpm test:e2e`: 画面テスト(Playwright)。テストは `e2e/` に置く。PC(Chrome、Edge)とスマートフォン(iPhone、Android)の4種類で実行する。ステージングに対して実行する場合は `E2E_BASE_URL` を指定する
- コードを変更したら、完了前に `pnpm check`、`pnpm typecheck`、`pnpm test` が通ることを確認する

TypeScript の設定:

- 共通の設定は `tsconfig.base.json`。各ワークスペースの `tsconfig.json` はこれを継承し、`package.json` に `typecheck` スクリプト(`tsc -p tsconfig.json`)を置く
- TypeScript 7 は `types` の既定が空のため、Node.js の型が必要なワークスペースは `"types": ["node"]` を指定する
- `baseUrl` は非推奨のため使わない。パッケージ間の参照は pnpm ワークスペースのパッケージ名で行う

Gitフック(husky、設定は `.husky/`):

- pre-commit: ステージしたファイルに lint-staged で `biome check --write` を実行する。自動で直せないエラーがあるとコミットできない
- pre-push: `pnpm typecheck` と `pnpm test` を実行する
- フックを `--no-verify` で回避しない。失敗したら原因を直す

## 設計書

実装や設計の変更は、以下の設計書に従う。仕様を変える場合は、該当する設計書も合わせて更新する。

- 要件定義書(ER図を含む): @docs/requirements.md
- 画面定義書: @docs/screens.md
- API仕様書: @docs/api.md
- テスト仕様書: @docs/test-spec.md
- 技術選定書: @docs/tech-stack.md
- CI/CD 設定手順書: @docs/cicd.md
