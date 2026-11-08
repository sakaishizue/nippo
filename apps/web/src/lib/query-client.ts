import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "./api";

const MAX_RETRIES = 3;

/**
 * 再試行するかを決める。4xx(401、403、404、409、422 など)は、やり直しても結果が変わらないため再試行しない。
 * 5xx と通信の失敗は3回まで再試行する
 */
export const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
};

/** 401 かどうか。セッションが切れたときにログイン画面へ移動するために使う */
export const isUnauthenticated = (error: unknown): boolean =>
  isApiError(error) && error.status === 401;

type Options = {
  /** API が 401 を返したときに呼ぶ */
  onUnauthenticated: () => void;
};

export const createQueryClient = ({ onUnauthenticated }: Options): QueryClient => {
  const onError = (error: unknown) => {
    if (isUnauthenticated(error)) onUnauthenticated();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: shouldRetry },
      // 更新は二重に実行されないよう、再試行しない
      mutations: { retry: false },
    },
  });
};
