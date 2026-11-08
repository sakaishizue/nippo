import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./env";
import { log } from "./logger";

const env = loadEnv();
const app = createApp();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log("INFO", `API server listening on port ${info.port}`, { nodeEnv: env.NODE_ENV });
});
