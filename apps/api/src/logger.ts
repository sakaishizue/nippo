import type { MiddlewareHandler } from "hono";

// Cloud Logging が解釈する構造化ログ。1行1件の JSON を標準出力に書く
type Severity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export const log = (severity: Severity, message: string, fields: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ severity, message, ...fields }));
};

export const requestLogger = (): MiddlewareHandler => async (c, next) => {
  const start = performance.now();
  await next();
  const latencySeconds = (performance.now() - start) / 1000;
  const status = c.res.status;
  log(status >= 500 ? "ERROR" : "INFO", `${c.req.method} ${c.req.path} ${status}`, {
    requestId: c.get("requestId"),
    httpRequest: {
      requestMethod: c.req.method,
      requestUrl: c.req.path,
      status,
      latency: `${latencySeconds.toFixed(3)}s`,
    },
  });
};
