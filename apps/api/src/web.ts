import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import type { AuthEnv } from "./auth/middleware";

// 画面(apps/web のビルド結果)の配信。本番は画面と API を1つの Cloud Run サービスから配信する(技術選定書 2章)

/** API のパス。ここは画面を返さず、API の 404 や 401 をそのまま返す */
const isApiPath = (path: string) => path === "/api" || path.startsWith("/api/");

/** Vite がファイル名に内容のハッシュを付けるファイル。内容が変わると名前も変わるため、長く保存してよい */
const isHashedAsset = (path: string) => path.startsWith("/assets/");

/**
 * 画面の静的ファイルを配信する。webDir は apps/web の `dist` を置いたディレクトリ(起動したディレクトリからの相対パスでもよい)。
 * - ファイルがあれば返す。`/assets/` は1年、それ以外(`index.html` など)は毎回確かめるようにする
 * - ファイルがなければ、画面側のルーティングのため `index.html` を返す。ただし `/assets/` は 404
 * - `/api` 以下には何もしない
 */
export const registerWebApp = (app: Hono<AuthEnv>, webDir: string) => {
  const files = serveStatic<AuthEnv>({ root: webDir });
  const indexHtml = serveStatic<AuthEnv>({ root: webDir, path: "index.html" });

  /** ファイルを返せたら、保存してよい期間を付ける。返せなければ次の処理へ進む */
  const serve = async (
    handler: typeof files,
    cacheControl: string,
    ...[c, next]: Parameters<typeof files>
  ) => {
    const res = await handler(c, next);
    if (res instanceof Response) res.headers.set("Cache-Control", cacheControl);
    return res;
  };

  app.get("*", (c, next) => {
    if (isApiPath(c.req.path)) return next();
    const cache = isHashedAsset(c.req.path) ? "public, max-age=31536000, immutable" : "no-cache";
    return serve(files, cache, c, next);
  });

  app.get("*", (c, next) => {
    if (isApiPath(c.req.path) || isHashedAsset(c.req.path)) return next();
    return serve(indexHtml, "no-cache", c, next);
  });
};
