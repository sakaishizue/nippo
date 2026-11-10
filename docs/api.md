# 営業日報システム API仕様書

> 更新日: 2026-11-09 / 状態: 初版(商談の has_visits を追加)
> 要件は [requirements.md](requirements.md)、画面は [screens.md](screens.md) を参照。

## 1. 共通仕様

### 1.1 基本

| 項目      | 内容                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| ベースURL | `/api/v1`                                                                         |
| 形式      | リクエストとレスポンスはJSON(`Content-Type: application/json`)、文字コードはUTF-8 |
| 項目名    | スネークケース(ER図のカラム名に合わせる)                                          |
| 日付      | `YYYY-MM-DD`(例: `2026-11-06`)                                                    |
| 日時      | ISO 8601、日本時間(例: `2026-11-06T18:30:00+09:00`)                               |
| ID        | 整数                                                                              |

### 1.2 認証

- ログインAPIでセッションを開始し、以降はセッションCookie(`nippo_session`、`HttpOnly`、`Secure`、`SameSite=Lax`、`Path=/`)で認証する
- セッションの有効期限は、最後のアクセスから7日。アクセスのたびに延長する(データベースへの書き込みと Cookie の送り直しは、前回の延長から1時間以上経ったときにまとめて行う)。期限が切れたら `401` を返し、Cookie を消す
- 更新系のリクエスト(POST、PUT、PATCH、DELETE)には、ヘッダー `X-CSRF-Token` を付ける。トークンは `GET /me` と `POST /auth/login` のレスポンスで返す。トークンがない、または不正な場合は `403 FORBIDDEN` を返す。`POST /auth/logout` にも必要
- 無効化されたユーザーのセッションは、次のリクエストで無効にする
- `/health` と `/auth/login` 以外は、ログインしていなければ、未定義のURLでも `401` を返す(どのURLがあるかを知られないため)

### 1.3 権限

- 各APIの「権限」欄に利用できるロールを示す。対象外のロールが呼んだ場合は `403` を返す
- 閲覧権限のない日報など、権限の範囲外のデータを指定した場合は `404` を返す。データの存在を知られないようにするため

### 1.4 一覧のページ送り

| パラメーター | 説明                               |
| ------------ | ---------------------------------- |
| `page`       | ページ番号。初期値は1              |
| `per_page`   | 1ページの件数。初期値は20、最大100 |

```json
{
  "items": [],
  "pagination": { "page": 1, "per_page": 20, "total": 135 }
}
```

### 1.5 ステータスコード

| コード | 意味                                                 |
| ------ | ---------------------------------------------------- |
| `200`  | 成功                                                 |
| `201`  | 作成成功                                             |
| `204`  | 成功(レスポンス本文なし)                             |
| `400`  | リクエストの形式が不正                               |
| `401`  | 未ログイン、またはセッション切れ                     |
| `403`  | ロールの権限がない                                   |
| `404`  | データがない、または閲覧権限がない                   |
| `409`  | 現在の状態では実行できない(ステータス違反、重複など) |
| `422`  | 入力チェックエラー                                   |
| `500`  | サーバー内部の想定外のエラー                         |

### 1.6 エラーレスポンス

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力内容に誤りがあります",
    "details": [{ "field": "work_entries[0].minutes", "message": "1以上の整数を入力してください" }]
  }
}
```

| `code`                    | ステータス | 意味                                                   |
| ------------------------- | ---------- | ------------------------------------------------------ |
| `BAD_REQUEST`             | 400        | リクエストの形式が不正(JSON として読めないなど)         |
| `UNAUTHENTICATED`         | 401        | 未ログイン                                             |
| `FORBIDDEN`               | 403        | 権限がない                                             |
| `NOT_FOUND`               | 404        | データがない                                           |
| `VALIDATION_ERROR`        | 422        | 入力チェックエラー。`details` に項目ごとの内容を入れる |
| `INVALID_STATUS`          | 409        | 日報のステータスが操作の条件に合わない                 |
| `REPORT_ALREADY_EXISTS`   | 409        | 同じ日付の日報がある                                   |
| `DUPLICATE_CUSTOMER_NAME` | 409        | 同じ名前の顧客がある                                   |
| `CONFLICT`                | 409        | その他の状態の不整合(部下がいる上長の無効化など)       |
| `INTERNAL_ERROR`          | 500        | 想定外のエラー。原因の詳細はレスポンスに含めず、ログに出す |

- 存在しないURLは `404 NOT_FOUND` を返す
- 各レスポンスには、ログと照合するためのリクエストID(`X-Request-Id` ヘッダー)を付ける

### 1.7 列挙値

| 項目                 | 値                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `role`               | `member`(一般)、`manager`(上長)、`admin`(管理者)                                          |
| `status`(日報)       | `draft`(下書き)、`submitted`(提出済み)、`returned`(差し戻し)、`approved`(承認済み)        |
| `category`(作業区分) | `visit`(訪問)、`travel`(移動)、`document`(資料作成)、`meeting`(社内会議)、`other`(その他) |
| `stage`(商談)        | `lead`(見込み)、`proposal`(提案中)、`negotiation`(交渉中)、`won`(受注)、`lost`(失注)      |
| `action`(承認履歴)   | `approved`(承認)、`returned`(差し戻し)                                                    |
| `type`(通知)         | `submitted`、`approved`、`returned`、`commented`、`reminder`                              |

## 2. API一覧

| 分類     | メソッド | パス                       | 概要                             | 権限       | 画面                           |
| -------- | -------- | -------------------------- | -------------------------------- | ---------- | ------------------------------ |
| 共通     | GET      | `/health`                  | ヘルスチェック                   | 不要       | なし(Cloud Run の起動確認用)    |
| 認証     | POST     | `/auth/login`              | ログイン                         | 未ログイン | SCR-01                         |
| 認証     | POST     | `/auth/logout`             | ログアウト                       | 全員       | 共通                           |
| 本人     | GET      | `/me`                      | ログイン中のユーザー情報         | 全員       | 共通                           |
| 本人     | PUT      | `/me/password`             | パスワード変更                   | 全員       | SCR-17                         |
| 本人     | GET      | `/me/subordinates`         | 直属の部下の一覧                 | 上長       | SCR-03, SCR-07                 |
| ホーム   | GET      | `/dashboard`               | ホームの表示内容                 | 一般、上長 | SCR-02                         |
| 日報     | GET      | `/reports`                 | 日報の検索                       | 全員       | SCR-03                         |
| 日報     | POST     | `/reports`                 | 日報の作成(下書き)               | 一般       | SCR-04                         |
| 日報     | GET      | `/reports/{id}`            | 日報の詳細                       | 全員       | SCR-04, SCR-05                 |
| 日報     | PUT      | `/reports/{id}`            | 日報の更新                       | 一般       | SCR-04                         |
| 日報     | POST     | `/reports/{id}/submit`     | 提出                             | 一般       | SCR-04                         |
| 日報     | POST     | `/reports/{id}/approve`    | 承認                             | 上長       | SCR-05                         |
| 日報     | POST     | `/reports/{id}/return`     | 差し戻し                         | 上長       | SCR-05                         |
| 日報     | POST     | `/reports/{id}/comments`   | コメント投稿                     | 一般、上長 | SCR-05                         |
| 日報     | GET      | `/reports/pending`         | 承認待ちの一覧                   | 上長       | SCR-06                         |
| 集計     | GET      | `/work-time-summary`       | 作業時間の集計                   | 一般、上長 | SCR-07                         |
| 顧客     | GET      | `/customers`               | 顧客の検索                       | 全員       | SCR-08, SCR-04                 |
| 顧客     | POST     | `/customers`               | 顧客の登録                       | 全員       | SCR-10, SCR-04                 |
| 顧客     | GET      | `/customers/{id}`          | 顧客の詳細                       | 全員       | SCR-09, SCR-10                 |
| 顧客     | PUT      | `/customers/{id}`          | 顧客の更新                       | 全員       | SCR-10                         |
| 顧客     | GET      | `/customers/{id}/visits`   | 顧客の訪問履歴                   | 全員       | SCR-09                         |
| 商談     | GET      | `/deals`                   | 商談の検索                       | 全員       | SCR-11, SCR-04                 |
| 商談     | POST     | `/deals`                   | 商談の登録                       | 全員       | SCR-13                         |
| 商談     | GET      | `/deals/{id}`              | 商談の詳細                       | 全員       | SCR-12, SCR-13                 |
| 商談     | PUT      | `/deals/{id}`              | 商談の更新                       | 全員       | SCR-13                         |
| 商談     | GET      | `/deals/{id}/visits`       | 商談の訪問履歴                   | 全員       | SCR-12                         |
| 通知     | GET      | `/notifications`           | 通知の一覧                       | 一般、上長 | SCR-14                         |
| 通知     | POST     | `/notifications/{id}/read` | 既読にする                       | 一般、上長 | SCR-14                         |
| 通知     | POST     | `/notifications/read-all`  | すべて既読にする                 | 一般、上長 | SCR-14                         |
| ユーザー | GET      | `/user-options`            | 選択肢用のユーザー一覧           | 全員       | SCR-03, SCR-11, SCR-13, SCR-16 |
| ユーザー | GET      | `/users`                   | ユーザーの検索                   | 管理者     | SCR-15                         |
| ユーザー | POST     | `/users`                   | ユーザーの登録                   | 管理者     | SCR-16                         |
| ユーザー | GET      | `/users/{id}`              | ユーザーの詳細                   | 管理者     | SCR-16                         |
| ユーザー | PATCH    | `/users/{id}`              | ユーザーの更新、パスワード再設定 | 管理者     | SCR-16                         |

- 未提出のリマインド(F-54)はAPIではなく、平日の朝9時に動く定期処理で通知を作成する。土日と祝日は休日とし、休日の日報は対象外。同じ日に2回実行しても通知は1件のみ
- 削除のAPIは設けない。日報は削除できず、ユーザーは無効化で対応する

### GET /health

API が起動しているかを確認する。ログインは不要で、データベースには接続しない。

**レスポンス** `200`

```json
{ "status": "ok" }
```

## 3. 認証・本人

### POST /auth/login

**リクエスト**

```json
{ "email": "yamada@example.com", "password": "********" }
```

**レスポンス** `200`: `GET /me` と同じ内容

| エラー                | 条件                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| `401 UNAUTHENTICATED` | メールアドレスかパスワードが誤り、またはユーザーが無効。どれが原因かは示さない |

### POST /auth/logout

セッションを破棄する。レスポンスは `204`。

### GET /me

**レスポンス** `200`

```json
{
  "id": 12,
  "name": "山田 太郎",
  "email": "yamada@example.com",
  "role": "member",
  "manager": { "id": 3, "name": "鈴木 一郎" },
  "unread_notification_count": 2,
  "csrf_token": "..."
}
```

- `manager` は一般のみ。上長と管理者は `null`

### PUT /me/password

**リクエスト**

```json
{ "current_password": "********", "new_password": "********" }
```

**レスポンス** `204`

| エラー                 | 条件                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `422 VALIDATION_ERROR` | 現在のパスワードが誤り(`current_password`)、新しいパスワードが8文字未満か128文字を超える、または現在のものと同じ(`new_password`) |

- 確認用の再入力の一致チェックは画面側で行う
- パスワードの上限(128文字)は、ハッシュ化の負荷を抑えるため。ユーザーの登録と再設定(10章)も同じ
- 変更すると、本人の他の端末のセッションを削除し、今の端末のセッションだけを残す。パスワードが漏れて第三者にログインされていた場合に、変更で締め出せるようにするため。失敗した場合はセッションを削除しない

### GET /me/subordinates

上長の直属の部下(有効なユーザーのみ)を返す。

**レスポンス** `200`

```json
{ "items": [{ "id": 12, "name": "山田 太郎" }] }
```

## 4. ホーム

### GET /dashboard

ロールによってレスポンスの内容が異なる。

**レスポンス(一般)** `200`

```json
{
  "today_report": { "id": 101, "report_date": "2026-11-07", "status": "draft" },
  "returned_reports": [
    { "id": 98, "report_date": "2026-11-05", "reason": "訪問内容をもう少し具体的に" }
  ],
  "recent_reports": [
    { "id": 100, "report_date": "2026-11-06", "status": "submitted", "total_minutes": 450 }
  ]
}
```

- 今日の日報が未作成の場合、`today_report` は `null`
- `recent_reports` は直近7日分

**レスポンス(上長)** `200`

```json
{
  "pending_count": 3,
  "subordinates": [
    {
      "user": { "id": 12, "name": "山田 太郎" },
      "previous_business_day": { "report_id": 100, "status": "submitted" },
      "today": null
    }
  ]
}
```

- 下書きは上長に見せないため、日報が下書きの場合も `null`(未提出)とする

## 5. 日報

### 日報の閲覧範囲

| ロール | 閲覧できる日報                                   |
| ------ | ------------------------------------------------ |
| 一般   | 自分の日報(すべてのステータス)                   |
| 上長   | 直属の部下の、提出済み、差し戻し、承認済みの日報 |
| 管理者 | 全員の、提出済み、差し戻し、承認済みの日報       |

### GET /reports

**クエリパラメーター**

| パラメーター       | 必須 | 説明                                                       |
| ------------------ | ---- | ---------------------------------------------------------- |
| `from`, `to`       |      | 期間(日付)                                                 |
| `user_id`          |      | 担当者。一般が指定した場合は無視する                       |
| `customer_id`      |      | 訪問記録の顧客                                             |
| `status`           |      | 複数指定可(例: `status=submitted&status=returned`)         |
| `q`                |      | 所感、翌日の予定、訪問内容、次回アクションを部分一致で検索 |
| `page`, `per_page` |      |                                                            |

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 100,
      "report_date": "2026-11-06",
      "user": { "id": 12, "name": "山田 太郎" },
      "status": "submitted",
      "visit_count": 2,
      "total_minutes": 450,
      "comment_count": 1
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- 日付の新しい順。同じ日付は登録の新しい順
- `from`、`to` はその日を含む。どちらか一方だけでもよい
- 閲覧範囲(上の表)の外の日報は、条件に合っても返さない。上長が部下以外を `user_id` に指定すると、0件になる

### POST /reports

日報を下書きとして作成する。

**リクエスト**

```json
{
  "report_date": "2026-11-07",
  "reflection": "提案資料の反応がよかった",
  "next_plan": "B社へ見積を送付",
  "work_entries": [
    {
      "category": "visit",
      "minutes": 90,
      "deal_id": 31,
      "note": null,
      "visit": {
        "customer_id": 8,
        "contact_name": "田中部長",
        "content": "新サービスの提案",
        "next_action": "来週までに見積を提示"
      }
    },
    { "category": "travel", "minutes": 60, "deal_id": null, "note": null, "visit": null }
  ]
}
```

| 項目                      | 必須 | チェック                                                    |
| ------------------------- | ---- | ----------------------------------------------------------- |
| `report_date`             | ○    | 未来の日付は不可                                            |
| `reflection`, `next_plan` |      | 各2,000文字以内                                             |
| `work_entries`            |      | 配列。下書きでは空でもよい                                  |
| `work_entries[].category` | ○    | 列挙値                                                      |
| `work_entries[].minutes`  | ○    | 1以上の整数。全行の合計は1,440以下                          |
| `work_entries[].deal_id`  |      | 訪問の場合、商談の顧客が `visit.customer_id` と一致すること |
| `work_entries[].note`     |      | 500文字以内                                                 |
| `work_entries[].visit`    |      | `category` が `visit` の場合は必須、それ以外は `null`       |
| `visit.customer_id`       | ○    |                                                             |
| `visit.content`           |      | 下書きでは空でもよい。提出時に必須。2,000文字以内           |
| `visit.contact_name`      |      | 100文字以内                                                 |
| `visit.next_action`       |      | 2,000文字以内                                               |

- 商談と訪問先の顧客が存在しない場合も `422`(`details` の項目は `work_entries[0].deal_id`、`work_entries[0].visit.customer_id` など)
- 所感、翌日の予定、メモ、面談相手などは、空の文字列を送ると未入力(`null`)として保存する

**レスポンス** `201`: `GET /reports/{id}` と同じ内容

| エラー                      | 条件                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `409 REPORT_ALREADY_EXISTS` | 同じ日付の日報がある。`error.existing_report_id` に既存の日報のIDを入れる |

### GET /reports/{id}

**レスポンス** `200`

```json
{
  "id": 100,
  "report_date": "2026-11-06",
  "user": { "id": 12, "name": "山田 太郎" },
  "status": "returned",
  "reflection": "提案資料の反応がよかった",
  "next_plan": "B社へ見積を送付",
  "submitted_at": "2026-11-06T18:30:00+09:00",
  "total_minutes": 150,
  "work_entries": [
    {
      "id": 501,
      "category": "visit",
      "minutes": 90,
      "deal": { "id": 31, "name": "新サービス導入" },
      "note": null,
      "visit": {
        "id": 201,
        "customer": { "id": 8, "name": "A株式会社" },
        "contact_name": "田中部長",
        "content": "新サービスの提案",
        "next_action": "来週までに見積を提示"
      }
    }
  ],
  "reviews": [
    {
      "id": 61,
      "reviewer": { "id": 3, "name": "鈴木 一郎" },
      "action": "returned",
      "reason": "訪問内容をもう少し具体的に",
      "created_at": "2026-11-06T20:00:00+09:00"
    }
  ],
  "comments": [
    {
      "id": 71,
      "user": { "id": 3, "name": "鈴木 一郎" },
      "body": "提案の反応を詳しく教えてください",
      "created_at": "2026-11-06T20:01:00+09:00"
    }
  ],
  "permissions": { "can_edit": true, "can_review": false, "can_comment": true }
}
```

- `reviews` と `comments` は古い順
- `permissions` は、ログイン中のユーザーが画面のボタンを表示するかの判定に使う。実際の権限チェックは各更新APIでも行う

### PUT /reports/{id}

日報の内容を丸ごと置き換える。リクエストの形式は `POST /reports` と同じ。

- `work_entries` は送った内容で全件を置き換える。送らなかった行は削除する
- 本人、かつステータスが `draft` または `returned` の場合のみ実行できる
- `report_date` は `draft` の間のみ変更できる。`returned` で変更した場合は `422`
- 保存してもステータスは変わらない

| エラー                      | 条件                                       |
| --------------------------- | ------------------------------------------ |
| `409 INVALID_STATUS`        | ステータスが `submitted` または `approved` |
| `409 REPORT_ALREADY_EXISTS` | 変更後の日付に別の日報がある               |

**レスポンス** `200`: `GET /reports/{id}` と同じ内容

### POST /reports/{id}/submit

日報を提出する。リクエスト本文はなし。

- 本人、かつステータスが `draft` または `returned` の場合のみ実行できる
- 提出時のチェック: 作業が1件以上、訪問の行は訪問内容が入力済み、所感と翌日の予定が入力済み
- 成功するとステータスを `submitted` にし、`submitted_at` を更新して、上長に通知を作成する

**レスポンス** `200`: `GET /reports/{id}` と同じ内容

| エラー                 | 条件                       |
| ---------------------- | -------------------------- |
| `409 INVALID_STATUS`   | ステータスが条件に合わない |
| `422 VALIDATION_ERROR` | 提出時のチェックに違反     |

### POST /reports/{id}/approve

日報を承認する。リクエスト本文はなし。

- 作成者の直属の上長、かつステータスが `submitted` の場合のみ実行できる
- 承認履歴を作成し、ステータスを `approved` にして、作成者に通知を作成する

**レスポンス** `200`: `GET /reports/{id}` と同じ内容

| エラー               | 条件                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `409 INVALID_STATUS` | ステータスが `submitted` でない(他の操作で先に処理された場合を含む) |

### POST /reports/{id}/return

日報を差し戻す。

**リクエスト**

```json
{ "reason": "訪問内容をもう少し具体的に" }
```

| 項目     | 必須 | チェック      |
| -------- | ---- | ------------- |
| `reason` | ○    | 1,000文字以内 |

- 実行条件と通知は承認と同じ。ステータスは `returned` にする

**レスポンス** `200`: `GET /reports/{id}` と同じ内容

### POST /reports/{id}/comments

**リクエスト**

```json
{ "body": "提案の反応を詳しく教えてください" }
```

| 項目   | 必須 | チェック      |
| ------ | ---- | ------------- |
| `body` | ○    | 1,000文字以内 |

- 日報の作成者と、作成者の直属の上長のみ実行できる
- 投稿者以外の、作成者と上長に通知を作成する。ただし下書きへのコメントは、上長が閲覧できないため上長に通知しない

**レスポンス** `201`

```json
{
  "id": 72,
  "user": { "id": 12, "name": "山田 太郎" },
  "body": "提案の反応を詳しく教えてください",
  "created_at": "2026-11-07T09:10:00+09:00"
}
```

### GET /reports/pending

直属の部下の、ステータスが `submitted` の日報を、提出日時の古い順に返す。

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 100,
      "report_date": "2026-11-06",
      "user": { "id": 12, "name": "山田 太郎" },
      "submitted_at": "2026-11-06T18:30:00+09:00",
      "is_overdue": false,
      "visit_count": 2,
      "total_minutes": 450
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- `is_overdue` は、提出から48時間以上経過している場合に `true`

## 6. 集計

### GET /work-time-summary

**クエリパラメーター**

| パラメーター | 必須 | 説明                                                                                    |
| ------------ | ---- | --------------------------------------------------------------------------------------- |
| `from`, `to` | ○    | 期間(日付)。最大1年                                                                     |
| `group_by`   | ○    | `user`、`customer`、`deal`、`category` のいずれか。一般が `user` を指定した場合は `422` |
| `user_id`    |      | 上長のみ。複数指定可。省略時は部下全員。部下以外を指定した場合は `422`                  |

**レスポンス** `200`

```json
{
  "group_by": "customer",
  "total_minutes": 2400,
  "items": [
    { "key": { "id": 8, "name": "A株式会社" }, "minutes": 900, "ratio": 0.375 },
    { "key": null, "minutes": 1500, "ratio": 0.625 }
  ]
}
```

- 集計の対象は、ステータスが `submitted` と `approved` の日報
- 一般は自分の日報、上長は部下の日報を集計する
- `key` が `null` の行は「未分類」。顧客別では訪問以外の作業、商談別では商談を紐づけていない作業の時間
- 時間の多い順。未分類は最後

## 7. 顧客

### GET /customers

| パラメーター       | 説明             |
| ------------------ | ---------------- |
| `q`                | 顧客名の部分一致 |
| `page`, `per_page` |                  |

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 8,
      "name": "A株式会社",
      "address": "東京都千代田区...",
      "phone": "03-1234-5678",
      "deal_count": 2,
      "last_visited_on": "2026-11-06"
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- `last_visited_on` は、提出済みと承認済みの日報の訪問記録から算出する。訪問がなければ `null`
- 顧客名の順に返す
- 日報入力画面の顧客の選択肢にも使う

### POST /customers

**リクエスト**

```json
{
  "name": "A株式会社",
  "address": "東京都千代田区...",
  "phone": "03-1234-5678",
  "confirm_duplicate": false
}
```

| 項目                | 必須 | チェック                                        |
| ------------------- | ---- | ----------------------------------------------- |
| `name`              | ○    | 100文字以内                                     |
| `address`           |      | 200文字以内                                     |
| `phone`             |      | 数字とハイフンのみ、20文字以内                  |
| `confirm_duplicate` |      | `true` の場合、同じ名前の顧客があっても登録する |

**レスポンス** `201`: `GET /customers/{id}` と同じ内容

| エラー                        | 条件                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `409 DUPLICATE_CUSTOMER_NAME` | 同じ名前の顧客があり、`confirm_duplicate` が `true` でない |

### GET /customers/{id}

**レスポンス** `200`

```json
{
  "id": 8,
  "name": "A株式会社",
  "address": "東京都千代田区...",
  "phone": "03-1234-5678",
  "deals": [
    {
      "id": 31,
      "name": "新サービス導入",
      "owner": { "id": 12, "name": "山田 太郎" },
      "stage": "proposal",
      "amount": 3000000,
      "expected_close_date": "2026-12-20"
    }
  ]
}
```

### PUT /customers/{id}

リクエストとチェックは `POST /customers` と同じ。名前の重複チェックは自分自身を除いて行う。レスポンスは `200`。

- 顧客名は前後の空白を除いてから、重複を確かめる
- 住所と電話番号は、空(または `null`)で送ると未入力として `null` にする。レスポンスでも未入力は `null`

### GET /customers/{id}/visits

**レスポンス** `200`

```json
{
  "items": [
    {
      "visit_id": 201,
      "visited_on": "2026-11-06",
      "visitor": { "id": 12, "name": "山田 太郎" },
      "deal": { "id": 31, "name": "新サービス導入" },
      "contact_name": "田中部長",
      "content": "新サービスの提案",
      "next_action": "来週までに見積を提示"
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- 提出済みと承認済みの日報の訪問記録を、訪問日の新しい順に返す。同じ日の訪問は登録の新しい順
- 作業時間、所感、翌日の予定、コメントは返さない
- 商談を紐づけていない訪問は `deal` が `null`
- クエリの `page`、`per_page` でページ送りする

## 8. 商談

### GET /deals

| パラメーター       | 説明             |
| ------------------ | ---------------- |
| `q`                | 商談名の部分一致 |
| `customer_id`      |                  |
| `owner_id`         |                  |
| `stage`            | 複数指定可       |
| `page`, `per_page` |                  |

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 31,
      "name": "新サービス導入",
      "customer": { "id": 8, "name": "A株式会社" },
      "owner": { "id": 12, "name": "山田 太郎" },
      "stage": "proposal",
      "amount": 3000000,
      "expected_close_date": "2026-12-20"
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- 登録の新しい順に返す
- `stage` は、同じ名前で繰り返して複数指定する(例: `stage=lead&stage=proposal`)

### POST /deals

**リクエスト**

```json
{
  "customer_id": 8,
  "name": "新サービス導入",
  "owner_id": 12,
  "stage": "proposal",
  "amount": 3000000,
  "expected_close_date": "2026-12-20"
}
```

| 項目                  | 必須 | チェック             |
| --------------------- | ---- | -------------------- |
| `customer_id`         | ○    | 存在する顧客         |
| `name`                | ○    | 100文字以内          |
| `owner_id`            | ○    | 有効な一般のユーザー |
| `stage`               | ○    | 列挙値               |
| `amount`              |      | 0以上、2,147,483,647以下の整数 |
| `expected_close_date` |      |                      |

**レスポンス** `201`: `GET /deals/{id}` と同じ内容

### GET /deals/{id}

レスポンスは `GET /deals` の1件分の項目に、`has_visits`(その商談に紐づく訪問記録が1件でもあれば `true`)を加えたもの。

```json
{
  "id": 31,
  "name": "新サービス導入",
  "customer": { "id": 8, "name": "A株式会社" },
  "owner": { "id": 12, "name": "山田 太郎" },
  "stage": "proposal",
  "amount": 3000000,
  "expected_close_date": "2026-12-20",
  "has_visits": true
}
```

- `has_visits` は、画面定義書 SCR-13 の「訪問記録がある商談は顧客を変更不可」に使う。下書きの日報の訪問も数える(顧客を変えると、訪問先と商談の顧客が食い違うため)
- `POST /deals` と `PUT /deals/{id}` のレスポンスも同じ形式

### PUT /deals/{id}

リクエストとチェックは `POST /deals` と同じ。レスポンスは `200`。

- 担当者が有効な一般のユーザーかは、担当者を変えるときだけ確かめる。担当者が後から無効になった商談でも、担当者以外の項目を更新できるようにするため

| エラー         | 条件                                         |
| -------------- | -------------------------------------------- |
| `409 CONFLICT` | 訪問記録に紐づく商談の顧客を変更しようとした |

### GET /deals/{id}/visits

レスポンスと表示ルールは `GET /customers/{id}/visits` と同じ。`deal` の代わりに `customer` を返す。

## 9. 通知

### GET /notifications

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 901,
      "type": "returned",
      "message": "11月6日の日報が差し戻されました",
      "report_id": 100,
      "read_at": null,
      "created_at": "2026-11-06T20:00:00+09:00"
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

- 新しい順。自分宛ての通知のみ返す

### POST /notifications/{id}/read

自分宛ての通知を既読にする。既読の場合も `204` を返す。

### POST /notifications/read-all

自分宛ての未読の通知をすべて既読にする。レスポンスは `204`。

## 10. ユーザー

### GET /user-options

商談の担当者、上長、日報一覧の担当者(管理者の場合)の選択肢に使う。有効なユーザーの氏名のみを返す。

| パラメーター | 必須 | 説明                      |
| ------------ | ---- | ------------------------- |
| `role`       | ○    | `member` または `manager` |

**レスポンス** `200`

```json
{ "items": [{ "id": 12, "name": "山田 太郎" }] }
```

### GET /users

| パラメーター       | 説明                                   |
| ------------------ | -------------------------------------- |
| `q`                | 氏名、メールアドレスの部分一致         |
| `role`             |                                        |
| `is_active`        | `true` または `false`。初期値は `true` |
| `page`, `per_page` |                                        |

**レスポンス** `200`

```json
{
  "items": [
    {
      "id": 12,
      "name": "山田 太郎",
      "email": "yamada@example.com",
      "role": "member",
      "manager": { "id": 3, "name": "鈴木 一郎" },
      "is_active": true
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 1 }
}
```

### POST /users

**リクエスト**

```json
{
  "name": "山田 太郎",
  "email": "yamada@example.com",
  "role": "member",
  "manager_id": 3,
  "password": "********",
  "is_active": true
}
```

| 項目         | 必須             | チェック                           |
| ------------ | ---------------- | ---------------------------------- |
| `name`       | ○                | 前後の空白を除いて1〜50文字        |
| `email`      | ○                | メール形式。他のユーザーと重複不可(重複は `422`、`details` の項目は `email`) |
| `role`       | ○                | 列挙値                             |
| `manager_id` | 一般の場合は必須 | 有効な上長のユーザー。一般以外で指定した場合は `422`。省略時は `null` |
| `password`   | ○                | 8〜128文字                         |
| `is_active`  | ○                |                                    |

**レスポンス** `201`: `GET /users/{id}` と同じ内容

### GET /users/{id}

レスポンスは `GET /users` の1件分の項目に、`has_reports`(そのユーザーの日報が1件でもあれば `true`)を加えたもの。パスワードは返さない。

```json
{
  "id": 12,
  "name": "山田 太郎",
  "email": "yamada@example.com",
  "role": "member",
  "manager": { "id": 3, "name": "鈴木 一郎" },
  "is_active": true,
  "has_reports": true
}
```

- `has_reports` は、画面定義書 SCR-16 の「一般のロール変更で日報が残っている場合は警告」に使う

### PATCH /users/{id}

送った項目だけを更新する。項目とチェックは `POST /users` と同じ。

- `password` を送った場合は、パスワードを再設定する(F-06)。再設定したユーザーのセッションはすべて削除する(PUT /me/password と同じ理由)
- `role` を一般以外に変更した場合は、`manager_id` を `null` にする(一般以外にするときに `manager_id` を指定すると `422`)
- 上長を一般に変更する場合は、`manager_id` も指定する(指定しないと `422`)
- 無効化した場合も、そのユーザーのセッションはすべて削除する

| エラー         | 条件                                           |
| -------------- | ---------------------------------------------- |
| `409 CONFLICT` | 有効な部下がいる上長のロール変更、または無効化 |
| `409 CONFLICT` | 自分自身のロール変更、または無効化             |

- 一般のロール変更で日報が残っている場合の警告は、画面側で `has_reports` を見て確認する

**レスポンス** `200`: `GET /users/{id}` と同じ内容

## 11. API設計で決定した事項

| No  | 事項                         | 決定内容                                                 |
| --- | ---------------------------- | -------------------------------------------------------- |
| 1   | 認証の方式                   | セッションCookie。スマートフォンアプリを作る場合は見直す |
| 2   | 文字数の上限                 | 所感と翌日の予定は2,000文字、メモは500文字               |
| 3   | ログインの連続失敗時のロック | 初期バージョンでは設けない                               |
| 4   | 商談の訪問記録の有無         | `GET /deals/{id}` に `has_visits` を返す。画面で顧客の変更を止めるため(#19) |
