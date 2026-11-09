import {
  type CustomerVisit,
  customerVisitSchema,
  type DealVisit,
  dealVisitSchema,
  formatDate,
  type Pagination as PaginationValue,
  paginatedSchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Pagination } from "@/components/list/Pagination";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";

type Props = { kind: "customer"; id: number } | { kind: "deal"; id: number };

const customerVisitsSchema = paginatedSchema(customerVisitSchema);
const dealVisitsSchema = paginatedSchema(dealVisitSchema);
type VisitPage = { items: (CustomerVisit | DealVisit)[]; pagination: PaginationValue };

/** 訪問の1件。商談の履歴では訪問先の顧客、顧客の履歴では商談を出す */
function VisitItem({ visit }: { visit: CustomerVisit | DealVisit }) {
  const related =
    "customer" in visit
      ? { label: "顧客", to: `/customers/${visit.customer.id}`, name: visit.customer.name }
      : visit.deal
        ? { label: "商談", to: `/deals/${visit.deal.id}`, name: visit.deal.name }
        : null;
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold">{formatDate(visit.visited_on)}</span>
        <span className="text-sm text-muted-foreground">訪問者: {visit.visitor.name}</span>
      </div>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {related && (
          <>
            <dt className="text-muted-foreground">{related.label}</dt>
            <dd>
              <Link to={related.to} className="text-primary underline-offset-4 hover:underline">
                {related.name}
              </Link>
            </dd>
          </>
        )}
        {visit.contact_name && (
          <>
            <dt className="text-muted-foreground">面談相手</dt>
            <dd>{visit.contact_name}</dd>
          </>
        )}
        <dt className="text-muted-foreground">訪問内容</dt>
        <dd className="text-base whitespace-pre-wrap">{visit.content || "(未入力)"}</dd>
        {visit.next_action && (
          <>
            <dt className="text-muted-foreground">次回アクション</dt>
            <dd className="text-base whitespace-pre-wrap">{visit.next_action}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

/**
 * 顧客または商談の訪問履歴(画面定義書 SCR-09、SCR-12)。提出済みと承認済みの日報の訪問を新しい順に出す。
 * 作業時間、所感、翌日の予定、コメントは API が返さないため、表示しない
 */
export function VisitHistory(props: Props) {
  const { page } = useListSearch();
  const path = `/${props.kind === "customer" ? "customers" : "deals"}/${props.id}/visits`;
  const visits = useQuery<VisitPage>({
    queryKey: ["visits", props.kind, props.id, page],
    queryFn: ({ signal }) => {
      const query = { page, per_page: PER_PAGE };
      return props.kind === "customer"
        ? api.get(path, { query, schema: customerVisitsSchema, signal })
        : api.get(path, { query, schema: dealVisitsSchema, signal });
    },
    placeholderData: keepPreviousData,
  });

  return (
    <section aria-labelledby={`${props.kind}-visits`} className="flex flex-col gap-3">
      <h2 id={`${props.kind}-visits`} className="text-base font-bold md:text-lg">
        訪問履歴
      </h2>
      {visits.isError ? (
        <p role="alert" className="text-destructive">
          訪問履歴を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : !visits.data ? (
        <p className="text-muted-foreground">読み込み中…</p>
      ) : visits.data.items.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          提出済みの日報の訪問はまだありません
        </p>
      ) : (
        <>
          <ul aria-label="訪問履歴" className="flex flex-col gap-3">
            {visits.data.items.map((visit) => (
              <VisitItem key={visit.visit_id} visit={visit} />
            ))}
          </ul>
          <Pagination total={visits.data.pagination.total} />
        </>
      )}
    </section>
  );
}
