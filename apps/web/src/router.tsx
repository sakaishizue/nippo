import type { QueryClient } from "@tanstack/react-query";
import { createBrowserRouter, type RouteObject } from "react-router";
import { requireUser } from "./auth/guard";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RouteErrorPage } from "./pages/RouteErrorPage";
import { SCREENS, type Screen } from "./screens";

const toRoute = (queryClient: QueryClient, screen: Screen): RouteObject => ({
  path: screen.path,
  element: <PlaceholderPage screenId={screen.id} name={screen.name} />,
  // ログインが必要な画面は、表示の前にログインとロールを確認する
  loader: screen.public
    ? undefined
    : async ({ request }) => {
        await requireUser(queryClient, request, screen.roles);
        return null;
      },
});

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter([
    {
      // loader のエラー(403 など)を表示する
      errorElement: <RouteErrorPage />,
      // 最初の表示で、ログインの確認が終わるまで表示する
      hydrateFallbackElement: <p className="p-4 text-muted-foreground">読み込み中…</p>,
      children: [
        ...SCREENS.map((screen) => toRoute(queryClient, screen)),
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ]);
