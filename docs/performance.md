# 営業日報システム 性能テストの手順と結果

> 更新日: 2026-11-15 / 状態: 初版(手順を追加。結果は測定後に記入する)
> 対象のケースは [test-spec.md](test-spec.md) 6章の NFR-04、NFR-05、NFR-13。要件は [requirements.md](requirements.md) 5章(通常の画面表示は3秒以内)。

## 1. 方法

| 項目 | 内容 |
| --- | --- |
| 環境 | ステージング(Cloud Run の `nippo-staging`、Neon の `nippo-staging`)。Neon は本番と同じ設定(0.25CU、自動停止あり)(テスト仕様書 2章) |
| データ | 50人が5年間使った量の、性能テストのデータ(2章)。実データは使わない |
| 測る場所 | 手元の PC(日本)のブラウザー(Playwright の Chrome、PC の画面サイズ) |
| 測る時間 | 画面のURLを開いてから、見出しが表示され、API の呼び出しがすべて終わり、「読み込み中…」が消えるまで |
| 回数と判定 | 各画面を5回ずつ開き、中央値が3秒以内なら合格。1回目はブラウザーにキャッシュがないため、遅くなりやすい |
| 測定のスクリプト | `perf/performance.spec.ts`(設定は `perf/playwright.config.ts`)。通常の画面テスト(`pnpm test:e2e`)には含めない |

## 2. 性能テストのデータ

`pnpm --filter @nippo/api perf-data insert` で入れる(処理は `apps/api/src/perf/perf-data.ts`)。毎回同じ内容になる。

| データ | 量 | 内容 |
| --- | --- | --- |
| ユーザー | 56人 | 管理者1人(`perf-admin`)、上長5人(`perf-m01`〜`05`)、一般50人(`perf-u01`〜`50`。上長1人に10人) |
| 顧客 | 500件 | 名前は「性能テスト顧客001」から |
| 商談 | 1,000件 | 顧客と担当者は無作為 |
| 日報 | 約6万件 | 一般ごとに、昨日までの5年間の営業日(2%は休み)。最後の5営業日は、提出済み、差し戻し、下書きを混ぜる |
| 作業 | 日報1件に3〜5件 | 訪問1〜3件(6割は顧客の商談を紐づける)、移動、資料作成など |
| 承認履歴、コメント、通知 | 日報ごと | 承認(5%は差し戻しの後に承認)、1割の日報に上長のコメント。提出、承認、差し戻し、コメントの通知。最後の5営業日の通知は未読 |

- ユーザーのメールアドレスは `@perf.example.com`、顧客名は「性能テスト」で始まる。削除のときは、この目印の付いたデータだけを消す
- パスワードは全員で共通。入れるときに画面で入力する(表示しない)。ステージングは公開されているため、決まった値にしない
- ローカルの `prisma dev` には入れない。日報が2万件を超えたあたりで応答しなくなり、再起動が要る(2026-11-15 に確認)

## 3. 手順

コマンドは、リポジトリのフォルダで Windows の PowerShell から実行する。

**1. データを入れる**

接続先は、ステージングの直接接続の接続文字列(`nippo-staging-database-direct-url`)にする。本番のシークレットを使わないよう、名前を確かめる。

```powershell
$env:DATABASE_URL = gcloud secrets versions access latest --secret=nippo-staging-database-direct-url
pnpm.cmd --filter @nippo/api perf-data insert
Remove-Item Env:DATABASE_URL
```

- 接続先のホスト名が表示されるので、ステージングの Neon のホスト名であることを確かめて `yes` を入力する。続けてパスワードを2回入力する
- 進み具合が一般1人ごとに表示される。終わると件数が表示される
- 環境変数 `DATABASE_URL` は、終わったら必ず消す(CI/CD 設定手順書 2.6 と同じ理由)

**2. 通常の表示を測る(NFR-04、NFR-05)**

`PERF_BASE_URL` は、ステージングの URL(Cloud Run の `nippo-staging` の URL)。

```powershell
$env:PERF_BASE_URL = "https://ステージングのURL"
$secure = Read-Host -AsSecureString "性能テストのユーザーのパスワード"
$env:PERF_PASSWORD = [System.Net.NetworkCredential]::new("", $secure).Password
pnpm.cmd test:perf --project=warm
```

- 結果の表が画面に表示され、`perf/results/` にも保存される(Git には含めない)。表を4章に転記する
- 中央値が3秒を超えた画面があると、テストが失敗する

**3. 停止した状態からの表示を測る(NFR-13)**

Cloud Run(約15分アクセスがないと停止する)と Neon(5分で停止する)がどちらも停止するまで、ステージングに30分以上アクセスしない。その後、次を1回だけ実行する。

```powershell
pnpm.cmd test:perf --project=cold
Remove-Item Env:PERF_PASSWORD, Env:PERF_BASE_URL
```

- ログイン画面の表示(主に Cloud Run の起動)と、ログインしてからホームの表示(主に Neon の起動)の時間を記録する。3秒を超えても失敗にはしない
- 3秒を超えた場合は、朝の利用開始前に起動しておくなどの対策を検討する(テスト仕様書 NFR-13)

**4. データを消す**

```powershell
$env:DATABASE_URL = gcloud secrets versions access latest --secret=nippo-staging-database-direct-url
pnpm.cmd --filter @nippo/api perf-data delete
Remove-Item Env:DATABASE_URL
```

- 消す件数が表示されるので、確かめて `yes` を入力する。元に戻せない
- 性能テストのデータを、他のデータ(画面テストで作った日報など)が参照している場合は、データベースが削除を拒否し、何も消さない

## 4. 結果

### 4.1 NFR-04、NFR-05

| 測定日 | データ量 | 結果 |
| --- | --- | --- |
| (未測定) | | |

### 4.2 NFR-13

| 測定日 | ログイン画面の表示 | ログインからホームの表示 | 合計 | 対策 |
| --- | --- | --- | --- | --- |
| (未測定) | | | | |
