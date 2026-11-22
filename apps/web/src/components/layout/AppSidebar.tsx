import { type Me, ROLE_LABELS } from "@nippo/shared";
import { LogOutIcon, NotebookPenIcon } from "lucide-react";
import { Link, NavLink } from "react-router";
import { homePathFor } from "@/auth/redirect";
import { ReportCalendar } from "@/components/calendar/ReportCalendar";
import { cn } from "@/lib/utils";
import { MENUS } from "@/navigation";
import { Avatar, MENU_ICONS, useLogout } from "./menu";

const focusRing = "focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-none";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground",
    focusRing,
    isActive &&
      "bg-sidebar-active font-bold text-sidebar-active-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-sidebar-indicator",
  );

/** PC(768px 以上)の左のサイドナビ(画面定義書 3.1)。メニュー、ユーザー名、ログアウト */
export function AppSidebar({ me }: { me: Me }) {
  const logout = useLogout();
  return (
    <aside
      aria-label="サイドナビ"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar text-sidebar-foreground md:flex"
    >
      <Link
        to={homePathFor(me.role)}
        className={cn(
          "mx-3 mt-3 flex h-12 items-center gap-2.5 rounded-lg px-2 text-lg font-bold text-sidebar-active-foreground",
          focusRing,
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <NotebookPenIcon className="size-4.5" />
        </span>
        営業日報
      </Link>

      <div className="mt-6 flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
        <nav aria-label="メニュー" className="flex flex-col gap-1">
          <p aria-hidden="true" className="px-3 pb-1 text-xs font-bold text-sidebar-muted">
            メニュー
          </p>
          {MENUS[me.role].map((item) => {
            const Icon = MENU_ICONS[item.to];
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {Icon && <Icon aria-hidden="true" className="size-5 shrink-0" />}
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <ReportCalendar me={me} tone="sidebar" />
      </div>

      <div className="flex flex-col gap-1 border-t border-sidebar-border p-3">
        <Link
          to="/profile"
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-sidebar-active",
            focusRing,
          )}
        >
          <Avatar name={me.name} />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold text-sidebar-active-foreground">
              {me.name}
            </span>
            <span className="text-xs text-sidebar-muted">{ROLE_LABELS[me.role]}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className={cn(
            "flex h-11 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground hover:bg-sidebar-active hover:text-sidebar-active-foreground disabled:opacity-50",
            focusRing,
          )}
        >
          <LogOutIcon aria-hidden="true" className="size-5" />
          ログアウト
        </button>
      </div>
    </aside>
  );
}
