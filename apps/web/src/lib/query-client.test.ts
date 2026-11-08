import { describe, expect, it, vi } from "vitest";
import { ApiError, toApiError } from "./api";
import { createQueryClient, shouldRetry } from "./query-client";

describe("shouldRetry", () => {
  it.each([400, 401, 403, 404, 409, 422])("%i は再試行しない", (status) => {
    expect(shouldRetry(0, toApiError(status, null))).toBe(false);
  });

  it("5xx と通信の失敗は3回まで再試行する", () => {
    const serverError = toApiError(500, null);
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(2, serverError)).toBe(true);
    expect(shouldRetry(3, serverError)).toBe(false);
    expect(shouldRetry(0, new TypeError("Failed to fetch"))).toBe(true);
  });
});

describe("createQueryClient", () => {
  const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "ログインしてください");

  it("取得で 401 を受けたら onUnauthenticated を呼ぶ", async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    await expect(
      client.query({
        queryKey: ["x"],
        queryFn: () => Promise.reject(unauthenticated()),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("更新で 401 を受けたら onUnauthenticated を呼ぶ", async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(unauthenticated()),
    });
    await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("401 以外のエラーでは呼ばない", async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    await expect(
      client.query({
        queryKey: ["x"],
        queryFn: () => Promise.reject(new ApiError(404, "NOT_FOUND", "見つかりません")),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
