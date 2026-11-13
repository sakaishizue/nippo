import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createDb } from "./db";
import { loadEnv } from "./env";
import { log } from "./logger";

const env = loadEnv();
const app = createApp({
  db: createDb(env.DATABASE_URL, env.DATABASE_POOL_MAX),
  // ローカル開発は HTTP のため、Secure を付けると Cookie が送られない
  secureCookie: env.NODE_ENV !== "development",
  webDir: env.WEB_DIR,
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log("INFO", `API server listening on port ${info.port}`, { nodeEnv: env.NODE_ENV });
});
