# 画面(apps/web)と API(apps/api)を1つのイメージにまとめる(技術選定書 2章)。
# Cloud Run のサービス(node dist/server.js)と、リマインドのジョブ(node dist/reminder.js)の両方で使う

ARG NODE_VERSION=24

# 1. 依存パッケージを入れて、画面と API をビルドする
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /repo
# Git フック(husky)は使わない
ENV HUSKY=0
RUN corepack enable

# 依存パッケージの一覧を先にコピーし、ソースを変えただけのときは入れ直さないようにする。
# API の postinstall で Prisma のクライアントを作るため、スキーマも先にコピーする
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma/schema.prisma apps/api/prisma/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @nippo/api build \
  && pnpm --filter @nippo/web build \
  && node -p "require('./apps/api/package.json').dependencies['@node-rs/argon2']" > /repo/argon2-version

# 2. 実行時に読み込むネイティブモジュール(@node-rs/argon2)だけを入れる。
# API はほかのパッケージを dist/server.js にまとめてあるため、node_modules はこれだけでよい
FROM node:${NODE_VERSION}-slim AS runtime-deps
WORKDIR /deps
COPY --from=build /repo/argon2-version ./
RUN npm init -y > /dev/null \
  && npm install --omit=dev --no-audit --no-fund "@node-rs/argon2@$(cat argon2-version)"

# 3. 本番のイメージ。ビルドした画面と API、ネイティブモジュールだけを含める
FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production \
  PORT=8080 \
  WEB_DIR=public
WORKDIR /app
# まとめた API は ES モジュールのため、type: module にする
RUN echo '{ "private": true, "type": "module" }' > package.json
COPY --from=runtime-deps /deps/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/web/dist ./public

# root 以外のユーザーで動かす(node イメージに用意されているユーザー)
USER node
EXPOSE 8080
# Cloud Run は環境変数 PORT で待ち受けるポートを渡す
CMD ["node", "--enable-source-maps", "dist/server.js"]
