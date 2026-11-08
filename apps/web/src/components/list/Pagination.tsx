import { Link, useSearchParams } from "react-router";
import { buttonVariants } from "@/components/ui/button";
import { PER_PAGE, pageFrom, pageRange, searchWithPage } from "@/lib/list-query";
import { cn } from "@/lib/utils";

type Props = {
  /** API の pagination.total */
  total: number;
  perPage?: number;
};

const linkClass = cn(buttonVariants({ variant: "outline" }), "min-w-20");
const disabledClass = cn(linkClass, "pointer-events-none opacity-50");

/** 一覧のページ送り(画面定義書 3.4)。検索条件はURLのクエリに残したまま、ページだけを変える */
export function Pagination({ total, perPage = PER_PAGE }: Props) {
  const [searchParams] = useSearchParams();
  const page = pageFrom(searchParams);
  const { from, to, lastPage, hasPrev, hasNext } = pageRange(page, perPage, total);

  return (
    <nav aria-label="ページ送り" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        全 {total.toLocaleString("ja-JP")}件中 {from}〜{to}件
      </p>
      {lastPage > 1 && (
        <div className="flex items-center gap-2">
          {hasPrev ? (
            <Link to={{ search: searchWithPage(searchParams, page - 1) }} className={linkClass}>
              前へ
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              前へ
            </span>
          )}
          <span className="px-1 text-sm text-muted-foreground">
            {page} / {lastPage}
          </span>
          {hasNext ? (
            <Link to={{ search: searchWithPage(searchParams, page + 1) }} className={linkClass}>
              次へ
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              次へ
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
