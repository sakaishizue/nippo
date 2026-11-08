import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  header: string;
  cell: (item: T) => ReactNode;
  /** 数値は右寄せにする */
  align?: "left" | "right";
};

type Props<T> = {
  items: readonly T[];
  columns: readonly Column<T>[];
  getKey: (item: T) => string | number;
  /** 768px 未満で表示するカードの中身(画面定義書 3.2)。カード全体を詳細へのリンクにする場合は、中身をリンクにする */
  renderCard: (item: T) => ReactNode;
  /** 件数が0のときの表示 */
  empty?: ReactNode;
  /** 表の説明(スクリーンリーダー向け) */
  caption: string;
};

/** 一覧。768px 以上は表、未満はカードで表示する(画面定義書 3.2) */
export function DataList<T>({ items, columns, getKey, renderCard, empty, caption }: Props<T>) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        {empty ?? "該当するデータがありません"}
      </p>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-xs md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b bg-background text-left text-muted-foreground">
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={cn("px-4 py-3 font-bold", column.align === "right" && "text-right")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getKey(item)} className="border-b last:border-b-0">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={cn("px-4 py-3.5", column.align === "right" && "text-right")}
                  >
                    {column.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={getKey(item)} className="rounded-xl border bg-card shadow-xs">
            {renderCard(item)}
          </li>
        ))}
      </ul>
    </>
  );
}
