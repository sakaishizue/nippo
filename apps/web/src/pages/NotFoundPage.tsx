import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <p className="mt-4">
        <Link to="/" className="underline">
          ホームへ戻る
        </Link>
      </p>
    </main>
  );
}
