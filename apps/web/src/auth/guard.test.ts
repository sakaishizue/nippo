import type { Me } from "@nippo/shared";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { FORBIDDEN_MESSAGE, hasRole, requireUser } from "./guard";
import { ME_QUERY_KEY } from "./me";

const me: Me = {
  id: 12,
  name: "山田 太郎",
  email: "u1@example.com",
  role: "member",
  manager: { id: 3, name: "鈴木 一郎" },
  unread_notification_count: 0,
  csrf_token: "token",
};

describe("hasRole", () => {
  it("roles を省略した画面は全員が使える", () => {
    expect(hasRole({ role: "admin" }, undefined)).toBe(true);
  });

  it("roles に含まれるロールだけが使える", () => {
    expect(hasRole({ role: "member" }, ["member", "manager"])).toBe(true);
    expect(hasRole({ role: "admin" }, ["member", "manager"])).toBe(false);
  });
});

describe("requireUser", () => {
  const request = new Request("http://localhost/reports?status=draft");
  afterEach(() => vi.unstubAllGlobals());

  it("取得済みのユーザーを使い、ロールが合えば返す", async () => {
    const client = new QueryClient();
    client.setQueryData(ME_QUERY_KEY, me);
    await expect(requireUser(client, request, ["member"])).resolves.toEqual(me);
  });

  it("ロールが合わなければ 403 を投げる", async () => {
    const client = new QueryClient();
    client.setQueryData(ME_QUERY_KEY, me);
    const error = await requireUser(client, request, ["admin"]).catch((e: unknown) => e);
    // data() で投げた値は、ルーターがエラー画面に渡す前に ErrorResponse に変える
    expect(error).toMatchObject({ data: FORBIDDEN_MESSAGE, init: { status: 403 } });
  });

  it("未ログイン(401)なら、元の画面に戻れるログイン画面へ移動する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "ログインしてください" } }),
            { status: 401 },
          ),
      ),
    );
    const error = await requireUser(new QueryClient(), request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Response);
    const res = error as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?redirect=%2Freports%3Fstatus%3Ddraft");
  });

  it("401 以外のエラーはそのまま投げる", async () => {
    const client = new QueryClient();
    const serverError = new ApiError(500, "INTERNAL_ERROR", "エラー");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw serverError;
      }),
    );
    await expect(requireUser(client, request)).rejects.toBe(serverError);
  });
});
