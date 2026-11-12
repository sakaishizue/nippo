import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { requireUser } from "./auth/guard";
import { AppLayout } from "./components/layout/AppLayout";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { UserCreatePage, UserEditPage } from "./pages/admin/UserFormPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { CustomerCreatePage, CustomerEditPage } from "./pages/customers/CustomerFormPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { DealDetailPage } from "./pages/deals/DealDetailPage";
import { DealCreatePage, DealEditPage } from "./pages/deals/DealFormPage";
import { DealsPage } from "./pages/deals/DealsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { StandaloneNotFoundPage } from "./pages/NotFoundPage";
import { NotificationsPage } from "./pages/notifications/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RootErrorPage, RouteErrorPage } from "./pages/RouteErrorPage";
import { ReportDetailPage } from "./pages/reports/ReportDetailPage";
import { ReportCreatePage, ReportEditPage } from "./pages/reports/ReportFormPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { SummaryPage } from "./pages/summary/SummaryPage";
import { SCREENS as ALL_SCREENS, type Screen } from "./screens";

const SCREENS: readonly Screen[] = ALL_SCREENS;

// 画面定義書の各画面。screens.ts の URL ごとに、表示する画面を登録する
const PAGES: Partial<Record<string, ReactNode>> = {
  "/login": <LoginPage />,
  "/": <HomePage />,
  "/approvals": <ApprovalsPage />,
  "/notifications": <NotificationsPage />,
  "/summary": <SummaryPage />,
  "/profile": <ProfilePage />,
  "/admin/users": <UsersPage />,
  "/admin/users/new": <UserCreatePage />,
  "/admin/users/:id": <UserEditPage />,
  "/customers": <CustomersPage />,
  "/customers/new": <CustomerCreatePage />,
  "/customers/:id": <CustomerDetailPage />,
  "/customers/:id/edit": <CustomerEditPage />,
  "/deals": <DealsPage />,
  "/deals/new": <DealCreatePage />,
  "/deals/:id": <DealDetailPage />,
  "/deals/:id/edit": <DealEditPage />,
  "/reports": <ReportsPage />,
  "/reports/new": <ReportCreatePage />,
  "/reports/:id": <ReportDetailPage />,
  "/reports/:id/edit": <ReportEditPage />,
};

/** URL の画面。screens.ts にあって、ここに登録していない画面があれば、起動したときにエラーにする */
const elementOf = (screen: Screen): ReactNode => {
  const page = PAGES[screen.path];
  if (!page) throw new Error(`画面が登録されていません: ${screen.id} ${screen.path}`);
  return page;
};

// ログインが必要な画面。表示の前にロールを確認し、エラー(403 など)はヘッダーの下に表示する
const toAppRoute = (queryClient: QueryClient, screen: Screen): RouteObject => ({
  path: screen.path,
  element: elementOf(screen),
  errorElement: <RouteErrorPage />,
  loader: async ({ request }) => {
    await requireUser(queryClient, request, screen.roles);
    return null;
  },
});

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter([
    {
      errorElement: <RootErrorPage />,
      // 最初の表示で、ログインの確認が終わるまで表示する
      hydrateFallbackElement: <p className="p-4 text-muted-foreground">読み込み中…</p>,
      children: [
        ...SCREENS.filter((screen) => screen.public).map((screen) => ({
          path: screen.path,
          element: elementOf(screen),
        })),
        {
          // ヘッダーとメニューの共通レイアウト。未ログインならログイン画面へ移動する
          element: <AppLayout />,
          loader: async ({ request }) => {
            await requireUser(queryClient, request);
            return null;
          },
          children: SCREENS.filter((screen) => !screen.public).map((screen) =>
            toAppRoute(queryClient, screen),
          ),
        },
        { path: "*", element: <StandaloneNotFoundPage /> },
      ],
    },
  ]);
