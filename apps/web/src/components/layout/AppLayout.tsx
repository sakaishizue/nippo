import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { ME_QUERY_KEY, useMe } from "@/auth/me";
import { AppHeader } from "./AppHeader";

/** ログインが必要な画面の共通レイアウト(画面定義書 3.1)。ヘッダーと、各画面の内容 */
export function AppLayout() {
  const me = useMe();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();

  // 画面を移動したら、ヘッダーの未読の通知の件数を読み直す(画面定義書 3.1)。
  // 最初の表示は loader で取得済みのため、移動したときだけ読み直す
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = "";
    void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [pathname, queryClient]);

  return (
    <div className="min-h-svh">
      <AppHeader me={me} />
      <main className="mx-auto max-w-[1120px] px-4 py-5 md:px-6 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
