import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellIcon,
  Building2Icon,
  ChartBarIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  HandshakeIcon,
  HouseIcon,
  type LucideIcon,
  UsersIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { clearSession } from "@/auth/me";
import { LOGIN_PATH } from "@/auth/redirect";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { badgeLabel } from "@/navigation";

/** メニューのアイコン(URL ごと)。文字を必ず添えるため、アイコンは飾り */
export const MENU_ICONS: Record<string, LucideIcon> = {
  "/": HouseIcon,
  "/approvals": ClipboardCheckIcon,
  "/reports": FileTextIcon,
  "/summary": ChartBarIcon,
  "/customers": Building2Icon,
  "/deals": HandshakeIcon,
  "/admin/users": UsersIcon,
};

/** ログアウトする。セッションが切れていて失敗しても、ログイン画面へ移動する */
export const useLogout = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: async () => {
      await navigate(LOGIN_PATH, { replace: true });
      clearSession(queryClient);
    },
  });
};

/** 氏名の頭文字の丸(アバター)。氏名を文字で添えて使う */
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground",
        className,
      )}
    >
      {name.trim().slice(0, 1)}
    </span>
  );
}

/** 通知のアイコン(未読件数のバッジ付き、画面定義書 3.1) */
export function NotificationLink({ count }: { count: number }) {
  const badge = badgeLabel(count);
  return (
    <Link
      to="/notifications"
      aria-label={badge ? `通知(未読${count}件)` : "通知"}
      className="relative flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <BellIcon aria-hidden="true" className="size-5" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-bold text-white ring-2 ring-card"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
