import {
  formatDateTime,
  type NotificationResponse,
  notificationSchema,
  paginatedSchema,
} from "@nippo/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { ME_QUERY_KEY } from "@/auth/me";
import { Pagination } from "@/components/list/Pagination";
import { notifyError } from "@/components/notify";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";
import { cn } from "@/lib/utils";
import { notificationTarget } from "./notification-target";

const notificationsPageSchema = paginatedSchema(notificationSchema);
const NOTIFICATIONS_KEY = ["notifications"] as const;

/** SCR-14 通知一覧。新しい順に表示し、選ぶと既読にして対象の画面を開く */
export function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { page } = useListSearch();
  const notifications = useQuery({
    queryKey: [...NOTIFICATIONS_KEY, page],
    queryFn: ({ signal }) =>
      api.get("/notifications", {
        query: { page, per_page: PER_PAGE },
        schema: notificationsPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  /** 既読にしたら、一覧とヘッダーの未読数を読み直す */
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  };

  const open = useMutation({
    mutationFn: async (notification: NotificationResponse) => {
      if (notification.read_at === null) {
        await api.post(`/notifications/${notification.id}/read`);
      }
      return notification;
    },
    onSuccess: async (notification) => {
      await refresh();
      const target = notificationTarget(notification);
      if (target) await navigate(target);
    },
    onError: () => notifyError("通知を開けませんでした。時間をおいてやり直してください"),
  });

  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: refresh,
    onError: () => notifyError("既読にできませんでした。時間をおいてやり直してください"),
  });

  const items = notifications.data?.items ?? [];
  const hasUnread = items.some((item) => item.read_at === null);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">通知一覧</h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => readAll.mutate()}
          disabled={readAll.isPending || !hasUnread}
        >
          すべて既読にする
        </Button>
      </div>

      {notifications.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          通知を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : !notifications.data ? (
        <p className="text-muted-foreground">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          通知はありません
        </p>
      ) : (
        <>
          <ul aria-label="通知一覧" className="divide-y rounded-xl border bg-card shadow-xs">
            {items.map((notification) => {
              const unread = notification.read_at === null;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open.mutate(notification)}
                    disabled={open.isPending}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted disabled:cursor-wait"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        unread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("break-words", unread && "font-bold")}>
                        {unread && <span className="sr-only">未読 </span>}
                        {notification.message}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(notification.created_at)}
                      </span>
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination total={notifications.data.pagination.total} />
        </>
      )}
    </div>
  );
}
