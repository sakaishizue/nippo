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
- `pnpm --filter @nippo/api build`: esbuild で `dist/server.js` の1ファイルにまとめる(設定は `build.mjs`)。`start` で起動する。ネイティブモジュールの `@node-rs/argon2` は、まとめずに実行時に node_modules から読み込む。CI でまとめたファイルを起動して確認している
- ルートは `/api/v1` 配下。アプリの組み立ては `src/app.ts` の `createApp({ db, secureCookie })`、起動は `src/server.ts`
- `/health` と `/auth/login` 以外のルートは、`app.ts` の認証とCSRFのミドルウェアより後に登録する。ログイン中のユーザーは `c.var.user`、セッションは `c.var.session`。ロールの制限は `requireRole("manager")`(`src/auth/middleware.ts`)
- エラーは `AppError`(`src/errors.ts`)を投げる。ステータスコードはエラーコードから決まり、API仕様書 1.6 の形式で返る
- 入力チェックは `validate()`(`src/validator.ts`)を使う。失敗すると `422 VALIDATION_ERROR` になる
- ログは `log()`(`src/logger.ts`)で JSON を出す。`console.log` を直接使わない
- テストは `createApp().request()` で API を呼ぶ。ログインが必要な API は `loginAs(createTestApp(), users.U1)`(`src/testing/auth.ts`)で、Cookie と CSRFトークンを付けて呼ぶ。テストデータのユーザーのパスワードは `TEST_PASSWORD`(`password123`)で、開発用のシードでも同じ
- 日報の閲覧範囲は `visibleReportsWhere(user)`、編集・承認・コメントの可否は `canEditReport()` などで判定する(`src/reports/access.ts`)。範囲外の日報は `404`(API仕様書 1.3)。日報の詳細は `findReportDetail()`(`src/reports/detail.ts`)
- 通知は `createNotifications(tx, event)`(`src/notifications.ts`)で作る。通知先と通知文のルール(F-51〜54)はここにまとめてある。日報の状態の変更と同じ `db.$transaction(async (tx) => ...)` の中で、tx を渡して呼ぶ
- 営業日の判定は `isBusinessDay()`、`previousBusinessDay()`(`src/business-day.ts`)を使う。日付は日本時間の `YYYY-MM-DD` の文字列で渡す(`Date` を渡すとサーバーのタイムゾーンでずれるため)。祝日のデータは `@holiday-jp/holiday_jp` で、2050年まで入っている
- pnpm は公開から1日経っていない版をインストールしない(`minimumReleaseAge`)。除外設定は入れず、少し前の版を選ぶ

データベース(PostgreSQL、Prisma 7):

- スキーマは `apps/api/prisma/schema.prisma`、Prisma の CLI の設定は `apps/api/prisma.config.ts`。テーブル名とカラム名はスネークケース(`@@map`、`@map`)、TypeScript ではキャメルケース
- クライアントは `apps/api/generated/prisma/` に生成する(Git に含めない)。`pnpm generate` で生成し、`pnpm typecheck` と `pnpm test` は実行前に自動で生成する
- ローカルの DB: `docker compose up -d`(ルート)で起動する。Docker がない場合は `pnpm --filter @nippo/api exec prisma dev --detach` で代用し、表示されたURLを `DIRECT_URL` と `DATABASE_URL` に設定する。`prisma dev` は同時接続に対応しないため、`apps/api/.env` に `DATABASE_POOL_MAX=1` も設定する(設定しないと、画面が API を並行して呼んだときに「bind message supplies ... parameters」などで 500 になる)
- スキーマを変えたら `pnpm --filter @nippo/api db:migrate --name <変更内容>` でマイグレーションを作る。マイグレーションのファイルは手で書き換えない
- 列挙値は `@nippo/shared` と一致させる(`apps/api/src/schema.test.ts` で確認する)
- `prisma migrate reset` など、データを消す操作は利用者の同意なしに実行しない
- `pnpm --filter @nippo/api db:seed`: 開発用のデータベースに、テスト仕様書 3章のデータを入れる。ユーザーが1人でもいれば何もしない
- `pnpm --filter @nippo/api create-admin --name <氏名> --email <メールアドレス>`: 最初の管理者を作る(F-04)。パスワードは画面で入力する(引数では受け取らない)。ステージングと本番での実行方法は CI/CD 設定手順書 2.6

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
- 画面を使えるロールは `src/screens.ts` の `roles` で指定する。ルートの loader の `requireUser()`(`src/auth/guard.ts`)が、未ログインならログイン画面(`?redirect=` に元の画面)へ移動し、権限がなければ403画面を表示する
- API は `api.get()` などで呼ぶ(`src/lib/api.ts`)。ベースURL `/api/v1`、更新系への CSRFトークンの付与を行い、エラーは `ApiError` を投げる。直接 `fetch` しない
- ログイン中のユーザーは `useMe()`(`src/auth/me.ts`)。ログインの直後は `setMe()` で覚える。API が `401` を返すと、ログイン画面へ移動する(`src/main.tsx`)
- `422` の項目のエラーは `applyServerErrors(error, setError)`(`src/lib/form-errors.ts`)で React Hook Form に反映する
- ログイン後に戻る画面は、`safeRedirectPath()`(`src/auth/redirect.ts`)で他のサイトでないことを確かめてから使う
- 部品は shadcn/ui。追加は `apps/web` で `pnpm dlx shadcn@4.23.0 add <部品名>` を実行し、`src/components/ui/` に置く。クラス名の結合は `cn()`(`src/lib/utils.ts`)
  - 追加した部品が `import { cn } from "cn"` になり、npm の `cn` パッケージが依存に入ることがある。`@/lib/utils` に直し、`cn` パッケージは削除する。部品が使う `@base-ui/react` が依存に入っているかも確認する
  - 生成された部品は手で直さない。Biome で引っかかるルールは、`biome.json` の `overrides` で `src/components/ui/` だけ無効にする
  - 例外として、`button.tsx`、`input.tsx`、`native-select.tsx` の既定の高さは 44px(`h-11`)に変えてある(画面定義書 3.2)。追加する部品がこれらに依存すると、上書きするかを聞かれて止まる。その場合は `--yes --overwrite` で追加し、`git checkout -- src/components/ui/button.tsx src/components/ui/input.tsx` などで変更前に戻す
  - 生成された部品の高さを変えたいときは、部品は直さず、使う側で `className="h-11"` を渡す(例: `CustomerCombobox`)
- 色は画面定義書 3.5 のテーマ変数(`bg-primary`、`text-muted-foreground`、`bg-status-returned` など)を使い、色の値を直接書かない
- 共通の部品: レイアウトは `components/layout/`(ログインが必要な画面はルーターで `AppLayout` の中に入る)。完了メッセージは `notifySuccess()`(`components/notify.tsx`)、確認ダイアログは `ConfirmDialog`、一覧は `DataList`(PC は表、スマホはカード)と `Pagination`、数値の入力欄は `NumberInput`(数字キーボード)
- 一覧の検索条件とページは URL のクエリに持つ。`useListSearch()`(`lib/use-list-search.ts`)で読み書きする
- 顧客の「選択(検索付き)」は `CustomerCombobox`、顧客の登録・編集のフォームは `CustomerForm`(画面を移動しないため、ダイアログにも置ける)、訪問履歴は `VisitHistory`
- 日付と金額の表示は `formatDate()`(2026年11月4日(水))、`formatYen()`(3,000,000円)、時間は `formatMinutes()`(`@nippo/shared`)
- import は `@/`(`src/` を指す)を使う
- 画面テスト(`pnpm test:e2e`)は API と画面の開発サーバーを自動で起動する。起動済みならそれを使う。API は `apps/api/.env` の `DATABASE_URL` のデータベースにつなぐため、マイグレーションとシード(`db:migrate:deploy`、`db:seed`)を済ませておく
- CI の「E2E tests」は、サービスコンテナの PostgreSQL にマイグレーションとシードを適用してから実行する。失敗すると、トレースとスクリーンショットを含む HTML のレポートを保存する

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
