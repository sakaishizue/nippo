import type { Me, Role } from "@nippo/shared";
import type { QueryClient } from "@tanstack/react-query";
import { data, redirect } from "react-router";
import { isApiError } from "@/lib/api";
import { meQueryOptions } from "./me";
import { loginPathFor } from "./redirect";

/** 画面を使えるロールか。roles を省略した場合は、ログインしていれば全員が使える */
export const hasRole = (me: Pick<Me, "role">, roles: readonly Role[] | undefined): boolean =>
  roles === undefined || roles.includes(me.role);

export const FORBIDDEN_MESSAGE = "この画面を表示する権限がありません";

/**
 * ルートの loader で、ログインとロールを確認する。
 * 未ログイン(401)ならログイン画面へ移動し、権限がなければ 403 のエラーを投げる(画面定義書 1章)
 */
export const requireUser = async (
  queryClient: QueryClient,
  request: Request,
  roles?: readonly Role[],
): Promise<Me> => {
  let me: Me;
  try {
    // 取得済みならそれを使う。セッション切れは、その後の API の 401 で分かる
    me = await queryClient.query({ ...meQueryOptions, staleTime: "static" });
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      throw redirect(loginPathFor(new URL(request.url)));
    }
    throw error;
  }
  if (!hasRole(me, roles)) throw data(FORBIDDEN_MESSAGE, { status: 403 });
  return me;
};
