import { Link } from "react-router";
import { FORBIDDEN_MESSAGE } from "@/auth/guard";

/** 権限のない画面を開いたときのエラー画面(403) */
export function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold">{FORBIDDEN_MESSAGE}</h1>
      <p className="mt-2 text-muted-foreground">エラーコード: 403</p>
      <p className="mt-4">
        <Link to="/" className="underline">
          ホームへ戻る
        </Link>
      </p>
    </main>
  );
}
