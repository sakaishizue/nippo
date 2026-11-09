import { dealDetailSchema, formatDate, formatYen } from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { Link, useParams } from "react-router";
import { DealStageLabel } from "@/components/DealStageLabel";
import { buttonVariants } from "@/components/ui/button";
import { VisitHistory } from "@/components/VisitHistory";
import { api, isApiError } from "@/lib/api";
import { NotFoundPage } from "@/pages/NotFoundPage";

/** SCR-12 商談詳細 */
export function DealDetailPage() {
  const { id } = useParams();
  const dealId = Number(id);
  const valid = Number.isInteger(dealId) && dealId > 0;
  const deal = useQuery({
    queryKey: ["deals", "detail", dealId],
    queryFn: ({ signal }) => api.get(`/deals/${dealId}`, { schema: dealDetailSchema, signal }),
    enabled: valid,
  });

  if (!valid || (isApiError(deal.error) && deal.error.status === 404)) return <NotFoundPage />;
  if (deal.isError) {
    return (
      <p role="alert" className="text-destructive">
        商談を読み込めませんでした。画面を再読み込みしてください。
      </p>
    );
  }
  if (!deal.data) return <p className="text-muted-foreground">読み込み中…</p>;
  const { data } = deal;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold break-all">{data.name}</h1>
        <Link to={`/deals/${data.id}/edit`} className={buttonVariants({ variant: "outline" })}>
          <PencilIcon aria-hidden="true" />
          編集
        </Link>
      </div>

      <section
        aria-labelledby="deal-info"
        className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-6"
      >
        <h2 id="deal-info" className="text-base font-bold md:text-lg">
          商談情報
        </h2>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-sm font-bold text-muted-foreground">商談名</dt>
          <dd className="break-all">{data.name}</dd>
          <dt className="text-sm font-bold text-muted-foreground">顧客</dt>
          <dd>
            {/* 顧客名を選ぶと顧客詳細へ(画面定義書 SCR-12) */}
            <Link
              to={`/customers/${data.customer.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {data.customer.name}
            </Link>
          </dd>
          <dt className="text-sm font-bold text-muted-foreground">担当者</dt>
          <dd>{data.owner.name}</dd>
          <dt className="text-sm font-bold text-muted-foreground">ステージ</dt>
          <dd>
            <DealStageLabel stage={data.stage} />
          </dd>
          <dt className="text-sm font-bold text-muted-foreground">見込金額</dt>
          <dd>{data.amount === null ? "未入力" : formatYen(data.amount)}</dd>
          <dt className="text-sm font-bold text-muted-foreground">受注予定日</dt>
          <dd>{data.expected_close_date ? formatDate(data.expected_close_date) : "未入力"}</dd>
        </dl>
      </section>

      <VisitHistory kind="deal" id={data.id} />
    </div>
  );
}
