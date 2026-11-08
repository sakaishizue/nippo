import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { User } from "../../generated/prisma/client";
import { handleError } from "../errors";
import { type AuthEnv, requireRole } from "./middleware";

// ログイン済みの状態を作り、requireRole だけを確かめるテスト用のアプリ
const appFor = (role: User["role"]) => {
  const app = new Hono<AuthEnv>();
  app.use(async (c, next) => {
    c.set("user", { role } as User);
    await next();
  });
  app.get("/managers-only", requireRole("manager"), (c) => c.text("ok"));
  app.get("/members-and-managers", requireRole("member", "manager"), (c) => c.text("ok"));
  app.onError(handleError);
  return app;
};

describe("requireRole", () => {
  test.each([
    ["manager", "/managers-only", 200],
    ["member", "/managers-only", 403],
    ["admin", "/managers-only", 403],
    ["member", "/members-and-managers", 200],
    ["manager", "/members-and-managers", 200],
    ["admin", "/members-and-managers", 403],
  ] as const)("%s が %s を呼ぶと %i", async (role, path, status) => {
    const res = await appFor(role).request(path);
    expect(res.status).toBe(status);
    if (status === 403) {
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
  });
});
