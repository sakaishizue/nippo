import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

/** 定義していないURL、または存在しないデータを開いたときの画面(404) */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">ページが見つかりません</h1>
        <p className="text-sm text-muted-foreground">エラーコード: 404</p>
      </div>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        ホームへ戻る
      </Link>
    </div>
  );
}

/** ヘッダーのない画面(未定義のURL)で、404画面を中央に置く */
export function StandaloneNotFoundPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <NotFoundPage />
    </main>
  );
}
