import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { z } from "zod";
import { handleError, handleNotFound } from "./errors";
import { requestLogger } from "./logger";
import { healthRoutes } from "./routes/health";

// 入力チェックのメッセージを日本語にする
z.config(z.locales.ja());

export const createApp = () => {
  const app = new Hono().basePath("/api/v1");
  app.use(requestId());
  app.use(requestLogger());
  app.route("/health", healthRoutes);
  app.notFound(handleNotFound);
  app.onError(handleError);
  return app;
};
