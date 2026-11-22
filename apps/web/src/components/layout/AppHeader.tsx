import { formatDate, type Me, ROLE_LABELS, todayInJst } from "@nippo/shared";
import { BellIcon, LogOutIcon, MenuIcon, NotebookPenIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { homePathFor } from "@/auth/redirect";
import { ReportCalendar } from "@/components/calendar/ReportCalendar";
import { cn } from "@/lib/utils";
import { badgeLabel, MENUS, showsNotifications } from "@/navigation";
import { Avatar, MENU_ICONS, NotificationLink, useLogout } from "./menu";

const focusRing = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-13 items-center gap-3 px-6 text-base text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
    isActive && "border-l-4 border-primary bg-accent pl-5 font-bold text-accent-foreground",
  );

/**
 * 全画面の上部バー(画面定義書 3.1)。PC は今日の日付と通知、メニューは左のサイドナビ(AppSidebar)。
 * 768px 未満では、システム名、通知、ハンバーガーメニューを置き、メニューを折りたたむ(3.2)
 */
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
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 pr-1 pl-4 md:h-16 md:px-6">
        <Link
          to={homePathFor(me.role)}
          className={cn(
            "mr-auto flex h-11 items-center gap-2 text-lg font-bold whitespace-nowrap md:hidden",
            focusRing,
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <NotebookPenIcon className="size-4" />
          </span>
          営業日報
        </Link>

        <p className="mr-auto hidden text-sm text-muted-foreground md:block">
          {formatDate(todayInJst())}
        </p>

        {notifications && <NotificationLink count={me.unread_notification_count} />}

        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "メニューを閉じる" : "メニューを開く"}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex size-11 items-center justify-center rounded-lg hover:bg-muted md:hidden",
            focusRing,
          )}
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
            className="absolute inset-x-0 top-14 flex max-h-[calc(100svh-3.5rem)] flex-col overflow-y-auto *:shrink-0 border-t bg-card pt-2 pb-4 shadow-lg md:hidden"
          >
            <nav aria-label="メニュー" className="flex flex-col">
              {menu.map((item) => {
                const Icon = MENU_ICONS[item.to];
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={mobileLinkClass}>
                    {Icon && (
                      <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                    )}
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <div className="my-2 h-px bg-border" />
            <div className="px-4">
              <ReportCalendar me={me} tone="card" />
            </div>
            <div className="my-2 h-px bg-border" />
            {notifications && (
              <NavLink to="/notifications" className={mobileLinkClass}>
                <BellIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                通知
                {badgeLabel(me.unread_notification_count) && (
                  <span className="rounded-full bg-destructive px-2 text-xs font-bold text-white">
                    {badgeLabel(me.unread_notification_count)}
                  </span>
                )}
              </NavLink>
            )}
            <NavLink to="/profile" className={mobileLinkClass}>
              <Avatar name={me.name} className="size-6 text-xs" />
              <span>
                {me.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {ROLE_LABELS[me.role]}
                </span>
              </span>
            </NavLink>
            <button
              type="button"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="mx-4 mt-2 flex h-12 items-center justify-center gap-2 rounded-lg border border-input text-base hover:bg-muted disabled:opacity-50"
            >
              <LogOutIcon aria-hidden="true" className="size-5" />
              ログアウト
            </button>
          </div>
        </>
      )}
    </header>
  );
}
