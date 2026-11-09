import { type CustomerDetail, customerDetailSchema, formatDate, formatYen } from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import { DealStageLabel } from "@/components/DealStageLabel";
import { type Column, DataList } from "@/components/list/DataList";
import { buttonVariants } from "@/components/ui/button";
import { VisitHistory } from "@/components/VisitHistory";
import { api, isApiError } from "@/lib/api";
import { NotFoundPage } from "@/pages/NotFoundPage";

type Deal = CustomerDetail["deals"][number];

const dealColumns: readonly Column<Deal>[] = [
  {
    header: "商談名",
    cell: (deal) => (
      <Link
        to={`/deals/${deal.id}`}
        className="font-bold text-primary underline-offset-4 hover:underline"
      >
        {deal.name}
      </Link>
    ),
  },
  { header: "担当者", cell: (deal) => deal.owner.name },
  { header: "ステージ", cell: (deal) => <DealStageLabel stage={deal.stage} /> },
  {
    header: "見込金額",
    cell: (deal) => (deal.amount === null ? "" : formatYen(deal.amount)),
    align: "right",
  },
  {
    header: "受注予定日",
    cell: (deal) => (deal.expected_close_date ? formatDate(deal.expected_close_date) : ""),
  },
];

function DealCard({ deal }: { deal: Deal }) {
  return (
    <Link to={`/deals/${deal.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-bold">{deal.name}</span>
        <DealStageLabel stage={deal.stage} />
      </span>
      <span className="text-sm text-muted-foreground">担当: {deal.owner.name}</span>
      {(deal.amount !== null || deal.expected_close_date) && (
        <span className="text-sm text-muted-foreground">
          {deal.amount !== null && formatYen(deal.amount)}
          {deal.amount !== null && deal.expected_close_date && " / "}
          {deal.expected_close_date && `受注予定 ${formatDate(deal.expected_close_date)}`}
        </span>
      )}
    </Link>
  );
}

/** SCR-09 顧客詳細 */
export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const valid = Number.isInteger(customerId) && customerId > 0;
  const customer = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: ({ signal }) =>
      api.get(`/customers/${customerId}`, { schema: customerDetailSchema, signal }),
    enabled: valid,
  });

  if (!valid || (isApiError(customer.error) && customer.error.status === 404))
    return <NotFoundPage />;
  if (customer.isError) {
    return (
      <p role="alert" className="text-destructive">
        顧客を読み込めませんでした。画面を再読み込みしてください。
      </p>
    );
  }
  if (!customer.data) return <p className="text-muted-foreground">読み込み中…</p>;
  const { data } = customer;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold break-all">{data.name}</h1>
        <Link to={`/customers/${data.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          <PencilIcon aria-hidden="true" />
          編集
        </Link>
      </div>

      <section
        aria-labelledby="customer-info"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-6"
      >
        <h2 id="customer-info" className="text-base font-bold md:text-lg">
          顧客情報
        </h2>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-sm font-bold text-muted-foreground">顧客名</dt>
          <dd className="break-all">{data.name}</dd>
          <dt className="text-sm font-bold text-muted-foreground">住所</dt>
          <dd>{data.address ?? "未登録"}</dd>
          <dt className="text-sm font-bold text-muted-foreground">電話番号</dt>
          <dd>
            {data.phone ? (
              <a
                href={`tel:${data.phone}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {data.phone}
              </a>
            ) : (
              "未登録"
            )}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="customer-deals" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="customer-deals" className="text-base font-bold md:text-lg">
            商談
          </h2>
          {/* 顧客を選択済みの商談登録へ(画面定義書 SCR-09) */}
          <Link
            to={`/deals/new?customer_id=${data.id}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <PlusIcon aria-hidden="true" />
            商談を追加
          </Link>
        </div>
        <DataList
          caption="商談"
          items={data.deals}
          columns={dealColumns}
          getKey={(deal) => deal.id}
          renderCard={(deal) => <DealCard deal={deal} />}
          empty="この顧客の商談はありません"
        />
      </section>

      <VisitHistory kind="customer" id={data.id} />
    </div>
  );
}
