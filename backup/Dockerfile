# データベースのバックアップのジョブ(Cloud Run ジョブ)のイメージ(CI/CD 設定手順書 2.7)。
# pg_dump は、データベースの PostgreSQL と同じか新しい版でないと書き出せない。
# Neon の版を上げたら、ここも同じか新しい版にする
FROM postgres:18.6-alpine

# Cloud Storage への保存に使う
RUN apk add --no-cache curl
COPY --chmod=755 backup.sh /usr/local/bin/nippo-backup

# root 以外のユーザーで動かす(postgres イメージに用意されているユーザー)
USER postgres
WORKDIR /tmp
ENTRYPOINT ["nippo-backup"]
