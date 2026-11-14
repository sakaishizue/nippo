import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { z } from "zod";
import { type AuthEnv, authenticate, csrfProtection } from "./auth/middleware";
import type { Db } from "./db";
import { handleError, handleNotFound } from "./errors";
import { requestLogger } from "./logger";
import { loginRoutes, logoutRoutes } from "./routes/auth";
import { customersRoutes } from "./routes/customers";
import { dashboardRoutes } from "./routes/dashboard";
import { dealsRoutes } from "./routes/deals";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { notificationsRoutes } from "./routes/notifications";
import { reportsRoutes } from "./routes/reports";
import { userOptionsRoutes, usersRoutes } from "./routes/users";
import { workTimeSummaryRoutes } from "./routes/work-time-summary";
import { registerWebApp } from "./web";

// 入力チェックのメッセージを日本語にする
z.config(z.locales.ja());

export type AppOptions = {
  db: Db;
  /** セッションの Cookie に Secure を付けるか。ローカル開発の HTTP のときだけ false にする */
  secureCookie: boolean;
  /**
   * 画面(apps/web のビルド結果)を置いたディレクトリ。指定すると、/api 以外のURLで画面を配信する(本番のイメージ)。
   * 開発では画面を Vite の開発サーバーが配信するため、指定しない
   */
  webDir?: string;
};

export const createApp = ({ db, secureCookie, webDir }: AppOptions) => {
  // API は /api/v1 の下に置く。root と app はルートを共有し、404 とエラーの扱いは root に置く
  const root = new Hono<AuthEnv>();
  const app = root.basePath("/api/v1");
  app.use(requestId());
  app.use(requestLogger());

  // ログインしなくても使えるルート
  app.route("/health", healthRoutes);
  app.route("/auth/login", loginRoutes({ db, secureCookie }));

  // ここから下はログインが必要。更新系はCSRFトークンも必要。
  // 未定義のURLも認証を通るため、ログインしていなければ 401 になり、どのURLがあるかを知られない
  app.use(authenticate({ db, secureCookie }));
  app.use(csrfProtection());
  app.route("/auth/logout", logoutRoutes({ db, secureCookie }));
  app.route("/me", meRoutes({ db }));
  app.route("/users", usersRoutes({ db }));
  app.route("/user-options", userOptionsRoutes({ db }));
  app.route("/customers", customersRoutes({ db }));
  app.route("/deals", dealsRoutes({ db }));
  app.route("/reports", reportsRoutes({ db }));
  app.route("/dashboard", dashboardRoutes({ db }));
  app.route("/work-time-summary", workTimeSummaryRoutes({ db }));
  app.route("/notifications", notificationsRoutes({ db }));

  // 画面は API の後に登録する。/api 以下のURLには画面を返さない
  if (webDir) registerWebApp(root, webDir);

  root.notFound(handleNotFound);
  root.onError(handleError);
  return root;
};
