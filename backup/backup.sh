#!/bin/sh
# データベースの全データを pg_dump で書き出し(custom 形式、圧縮済み)、Cloud Storage のバケットに保存する。
# 環境変数:
#   DATABASE_URL  書き出すデータベース(Neon の直接接続の接続文字列)
#   BUCKET        保存先のバケット
#   STORAGE_API、METADATA_URL  CI で偽のサーバーに向けるときだけ指定する
# 失敗したら 0 以外で終わる。Cloud Run ジョブの実行が失敗になり、アラートが届く(CI/CD 設定手順書 2.7)
set -eu

: "${DATABASE_URL:?DATABASE_URL を設定してください}"
: "${BUCKET:?BUCKET を設定してください}"
STORAGE_API="${STORAGE_API:-https://storage.googleapis.com}"
METADATA_URL="${METADATA_URL:-http://metadata.google.internal}"

# Cloud Logging で重要度を見分けられるよう、1行の JSON で出す
log() {
  printf '{"severity":"%s","message":"%s"}\n' "$1" "$2"
}

name="nippo-$(date -u +%Y%m%dT%H%M%SZ).dump"
file="$(mktemp)"
trap 'rm -f "$file"' EXIT

log INFO "書き出しを始めます: ${name}"
if ! pg_dump --format=custom --file="$file" --dbname="$DATABASE_URL"; then
  log ERROR "pg_dump に失敗しました"
  exit 1
fi
size="$(wc -c < "$file" | tr -d ' ')"
log INFO "書き出しました: ${size} バイト"

# ジョブのサービスアカウントのアクセストークンを、メタデータサーバーから取得する
token="$(curl -fsS -H "Metadata-Flavor: Google" \
  "${METADATA_URL}/computeMetadata/v1/instance/service-accounts/default/token" \
  | sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p')" || token=""
if [ -z "$token" ]; then
  log ERROR "アクセストークンを取得できませんでした"
  exit 1
fi

# ifGenerationMatch=0: 同じ名前のファイルがあれば上書きせずに失敗する
if ! curl -fsS -X POST -o /dev/null \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/octet-stream" \
  -T "$file" \
  "${STORAGE_API}/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${name}&ifGenerationMatch=0"; then
  log ERROR "バケット ${BUCKET} への保存に失敗しました"
  exit 1
fi

log INFO "保存しました: gs://${BUCKET}/${name}"
