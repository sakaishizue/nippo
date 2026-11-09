import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { z } from "zod";
import { type AuthEnv, authenticate, csrfProtection } from "./auth/middleware";
import type { Db } from "./db";
import { handleError, handleNotFound } from "./errors";
import { requestLogger } from "./logger";
import { loginRoutes, logoutRoutes } from "./routes/auth";
import { customersRoutes } from "./routes/customers";
import { healthRoutes } from "./routes/health";
import { meRoutes } from "./routes/me";
import { userOptionsRoutes, usersRoutes } from "./routes/users";

// 入力チェックのメッセージを日本語にする
z.config(z.locales.ja());

export type AppOptions = {
  db: Db;
  /** セッションの Cookie に Secure を付けるか。ローカル開発の HTTP のときだけ false にする */
  secureCookie: boolean;
};

export const createApp = ({ db, secureCookie }: AppOptions) => {
  const app = new Hono<AuthEnv>().basePath("/api/v1");
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

  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
};
