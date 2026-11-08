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
- `@nippo/shared` は TypeScript のソースをそのまま公開する。読み込む側は必ずバンドラー(API は esbuild、画面は Vite)か tsx を通す。`tsc` の出力を Node.js で直接実行しない

API(`apps/api`、Hono):

- `pnpm --filter @nippo/api dev`: 開発サーバー(ファイル監視付き)。`apps/api/.env.example` を `.env` にコピーして使う
- `pnpm --filter @nippo/api build`: esbuild で `dist/server.js` の1ファイルにまとめる。`start` で起動する
- ルートは `/api/v1` 配下。アプリの組み立ては `src/app.ts` の `createApp()`、起動は `src/server.ts`
- エラーは `AppError`(`src/errors.ts`)を投げる。ステータスコードはエラーコードから決まり、API仕様書 1.6 の形式で返る
- 入力チェックは `validate()`(`src/validator.ts`)を使う。失敗すると `422 VALIDATION_ERROR` になる
- ログは `log()`(`src/logger.ts`)で JSON を出す。`console.log` を直接使わない
- テストは `createApp().request()` で API を呼ぶ
- pnpm は公開から1日経っていない版をインストールしない(`minimumReleaseAge`)。除外設定は入れず、少し前の版を選ぶ

データベース(PostgreSQL、Prisma 7):

- スキーマは `apps/api/prisma/schema.prisma`、Prisma の CLI の設定は `apps/api/prisma.config.ts`。テーブル名とカラム名はスネークケース(`@@map`、`@map`)、TypeScript ではキャメルケース
- クライアントは `apps/api/generated/prisma/` に生成する(Git に含めない)。`pnpm generate` で生成し、`pnpm typecheck` と `pnpm test` は実行前に自動で生成する
- ローカルの DB: `docker compose up -d`(ルート)で起動する。Docker がない場合は `pnpm --filter @nippo/api exec prisma dev --detach` で代用し、表示されたURLを `DIRECT_URL` と `DATABASE_URL` に設定する
- スキーマを変えたら `pnpm --filter @nippo/api db:migrate --name <変更内容>` でマイグレーションを作る。マイグレーションのファイルは手で書き換えない
- 列挙値は `@nippo/shared` と一致させる(`apps/api/src/schema.test.ts` で確認する)
- `prisma migrate reset` など、データを消す操作は利用者の同意なしに実行しない
- `pnpm --filter @nippo/api db:seed`: 開発用のデータベースに、テスト仕様書 3章のデータを入れる。ユーザーが1人でもいれば何もしない

APIテスト(データベースを使うテスト):

- ファイル名は `*.db.test.ts`。Vitest の `api-db` プロジェクトで、ファイルを1つずつ順に実行する。それ以外の `*.test.ts` は `unit` プロジェクト
- 接続先は `TEST_DATABASE_URL`(`apps/api/.env.example` と同じ場所の `.env.test`、見本は `.env.test.example`)。開発用とは別のデータベースにする。テストのたびに全データを消すため
- 未設定のとき、ローカルではデータベースを使うテストを飛ばし、CI ではエラーにする。CI は「Lint and unit tests」のサービスコンテナの PostgreSQL を使う
- 実行前にマイグレーションを自動で適用し(`src/testing/global-setup.ts`)、テストごとに全テーブルを空にする(`src/testing/setup-db.ts`)
- データベースのクライアントは `testDb`(`src/testing/test-db.ts`)。テスト仕様書 3章のデータは `seedTestData(testDb)`(`src/testing/fixtures.ts`)で作り、A1、M1、U1、R-sub などの記号で参照する
- API の中では `new Date()` ではなく `now()`(`src/clock.ts`)を使う。テストでは `setNow()` で日時を固定する

画面(`apps/web`、React + Vite):

- `pnpm dev`(ルート): API(ポート8080)と画面(ポート5173)を同時に起動する。画面の `/api` へのリクエストは API に転送する
- `pnpm --filter @nippo/web build`: `dist/` にビルドする
- 画面のURLは `src/screens.ts` と画面定義書「画面のURL」で管理する。ルーティングは `src/router.tsx`(React Router のデータモード)
- 部品は shadcn/ui。追加は `apps/web` で `pnpm dlx shadcn@4.23.0 add <部品名>` を実行し、`src/components/ui/` に置く。クラス名の結合は `cn()`(`src/lib/utils.ts`)
- import は `@/`(`src/` を指す)を使う
- 画面テスト(`pnpm test:e2e`)は画面の開発サーバーを自動で起動する。起動済みならそれを使う

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
