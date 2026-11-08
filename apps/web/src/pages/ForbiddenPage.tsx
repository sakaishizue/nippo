import { FORBIDDEN_MESSAGE } from "@/auth/guard";

/** 権限のない画面を開いたときのエラー画面(403)。ヘッダーの下に表示する */
export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">{FORBIDDEN_MESSAGE}</h1>
        <p className="text-sm text-muted-foreground">エラーコード: 403</p>
      </div>
      <p>メニューから、利用できる画面を選んでください。</p>
    </div>
  );
}
