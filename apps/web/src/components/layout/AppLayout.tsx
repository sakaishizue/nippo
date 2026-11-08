import { Outlet } from "react-router";
import { useMe } from "@/auth/me";
import { AppHeader } from "./AppHeader";

/** ログインが必要な画面の共通レイアウト(画面定義書 3.1)。ヘッダーと、各画面の内容 */
export function AppLayout() {
  const me = useMe();
  return (
    <div className="min-h-svh">
      <AppHeader me={me} />
      <main className="mx-auto max-w-[1120px] px-4 py-5 md:px-6 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
