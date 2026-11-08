import { isRouteErrorResponse, useRouteError } from "react-router";
import { isApiError } from "@/lib/api";
import { ForbiddenPage } from "./ForbiddenPage";
import { NotFoundPage } from "./NotFoundPage";

const statusOf = (error: unknown): number | undefined => {
  if (isRouteErrorResponse(error)) return error.status;
  if (isApiError(error)) return error.status;
  return undefined;
};

/** ルートの loader や画面で起きたエラーを表示する */
export function RouteErrorPage() {
  const error = useRouteError();
  const status = statusOf(error);
  if (status === 403) return <ForbiddenPage />;
  if (status === 404) return <NotFoundPage />;
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="mt-2 text-muted-foreground">時間をおいて、画面を再読み込みしてください。</p>
    </main>
  );
}
