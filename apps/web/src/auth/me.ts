import { type Me, meSchema } from "@nippo/shared";
import { type QueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { api, setCsrfToken } from "@/lib/api";

export const ME_QUERY_KEY = ["me"] as const;

/** GET /me でログイン中のユーザーを取得し、CSRFトークンを覚える */
export const fetchMe = async (signal?: AbortSignal): Promise<Me> => {
  const me = await api.get("/me", { schema: meSchema, signal });
  setCsrfToken(me.csrf_token);
  return me;
};

export const meQueryOptions = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: ({ signal }) => fetchMe(signal),
  // 未読の通知の件数を含むため、1分で古いとみなす
  staleTime: 60_000,
});

/** ログインの直後に、POST /auth/login のレスポンスをログイン中のユーザーとして覚える */
export const setMe = (queryClient: QueryClient, me: Me): void => {
  setCsrfToken(me.csrf_token);
  queryClient.setQueryData(ME_QUERY_KEY, me);
};

/** ログアウトやセッション切れのときに、ログイン中のユーザーと取得済みのデータを捨てる */
export const clearSession = (queryClient: QueryClient): void => {
  setCsrfToken(null);
  queryClient.clear();
};

/**
 * ログイン中のユーザーを返す。ログインが必要な画面(ルートの loader で取得済み)の中で使う
 */
export const useMe = (): Me => useSuspenseQuery(meQueryOptions).data;
