import { isRouteErrorResponse, useRouteError } from "react-router";
import { isApiError } from "@/lib/api";
import { ForbiddenPage } from "./ForbiddenPage";
import { NotFoundPage } from "./NotFoundPage";

const statusOf = (error: unknown): number | undefined => {
  if (isRouteErrorResponse(error)) return error.status;
  if (isApiError(error)) return error.status;
  return undefined;
};

function UnexpectedError() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-6 shadow-xs">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-muted-foreground">時間をおいて、画面を再読み込みしてください。</p>
    </div>
  );
}

/** 画面の loader や表示で起きたエラーを、ヘッダーの下に表示する */
export function RouteErrorPage() {
  const error = useRouteError();
  const status = statusOf(error);
  if (status === 403) return <ForbiddenPage />;
  if (status === 404) return <NotFoundPage />;
  return <UnexpectedError />;
}

/** ヘッダーを出す前(ログインの確認など)のエラー */
export function RootErrorPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <RouteErrorPage />
    </main>
  );
}
