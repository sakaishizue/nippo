import type { Me } from "@nippo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellIcon, MenuIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { clearSession } from "@/auth/me";
import { homePathFor, LOGIN_PATH } from "@/auth/redirect";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { badgeLabel, MENUS, showsNotifications } from "@/navigation";

/** ログアウトする。セッションが切れていて失敗しても、ログイン画面へ移動する */
const useLogout = () => {
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

function NotificationLink({ count, className }: { count: number; className?: string }) {
  const badge = badgeLabel(count);
  return (
    <Link
      to="/notifications"
      aria-label={badge ? `通知(未読${count}件)` : "通知"}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-lg text-header-foreground hover:bg-header-active focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none",
        className,
      )}
    >
      <BellIcon aria-hidden="true" className="size-5" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-bold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-11 items-center rounded-lg px-3 text-sm whitespace-nowrap text-header-foreground hover:bg-header-active focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none",
    isActive && "bg-header-active font-bold",
  );

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-13 items-center px-6 text-base text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
    isActive && "border-l-4 border-primary bg-accent pl-5 font-bold text-accent-foreground",
  );

/** 全画面のヘッダー(画面定義書 3.1)。768px 未満ではメニューを折りたたむ(3.2) */
export function AppHeader({ me }: { me: Me }) {
  const menu = MENUS[me.role];
  const notifications = showsNotifications(me.role);
  const logout = useLogout();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // 画面を移動したらメニューを閉じる
  // biome-ignore lint/correctness/useExhaustiveDependencies: 移動のたびに閉じるため location に依存する
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  // Esc でメニューを閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-header text-header-foreground">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 pr-1 pl-4 md:gap-6 md:px-6">
        <Link
          to={homePathFor(me.role)}
          className="mr-auto flex h-11 items-center text-lg font-bold whitespace-nowrap md:mr-0 focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none"
        >
          営業日報
        </Link>

        <nav aria-label="メニュー" className="hidden flex-1 items-center gap-1 md:flex">
          {menu.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {notifications && <NotificationLink count={me.unread_notification_count} />}

        <Link
          to="/profile"
          className="hidden h-11 items-center px-1 text-sm whitespace-nowrap hover:underline focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none md:flex"
        >
          {me.name}
        </Link>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="hidden h-11 items-center rounded-lg border border-header-border px-3 text-sm whitespace-nowrap hover:bg-header-active focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none disabled:opacity-50 md:flex"
        >
          ログアウト
        </button>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          onClick={() => setOpen((value) => !value)}
          className="flex size-11 items-center justify-center rounded-lg hover:bg-header-active focus-visible:ring-3 focus-visible:ring-header-border focus-visible:outline-none md:hidden"
        >
          {open ? (
            <XIcon aria-hidden="true" className="size-6" />
          ) : (
            <MenuIcon aria-hidden="true" className="size-6" />
          )}
        </button>
      </div>

      {open && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-x-0 top-14 bottom-0 bg-foreground/40 md:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            className="absolute inset-x-0 top-14 flex flex-col bg-card pt-2 pb-4 shadow-lg md:hidden"
          >
            <nav aria-label="メニュー" className="flex flex-col">
              {menu.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={mobileLinkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="my-2 h-px bg-border" />
            {notifications && (
              <NavLink to="/notifications" className={mobileLinkClass}>
                通知
                {badgeLabel(me.unread_notification_count) && (
                  <span className="ml-2 rounded-full bg-destructive px-2 text-xs font-bold text-white">
                    {badgeLabel(me.unread_notification_count)}
                  </span>
                )}
              </NavLink>
            )}
            <NavLink to="/profile" className={mobileLinkClass}>
              {me.name}(プロフィール)
            </NavLink>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="mx-4 mt-2 h-12 rounded-lg border border-input text-base hover:bg-muted disabled:opacity-50"
            >
              ログアウト
            </button>
          </div>
        </>
      )}
    </header>
  );
}
