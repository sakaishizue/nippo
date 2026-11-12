import {
  formatDate,
  formatDateTime,
  formatMinutes,
  type PendingReport,
  paginatedSchema,
  pendingReportSchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClockAlertIcon } from "lucide-react";
import { Link } from "react-router";
import { type Column, DataList } from "@/components/list/DataList";
import { Pagination } from "@/components/list/Pagination";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";

const pendingPageSchema = paginatedSchema(pendingReportSchema);

/** 提出日時。提出から48時間以上のものは強調する(画面定義書 SCR-06)。色だけでなく文字でも示す */
function SubmittedAt({ report }: { report: PendingReport }) {
  if (!report.is_overdue) return <span>{formatDateTime(report.submitted_at)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 font-bold text-warning">
      <span>{formatDateTime(report.submitted_at)}</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-surface px-2 text-xs leading-6">
        <ClockAlertIcon aria-hidden="true" className="size-3.5" />
        48時間以上経過
      </span>
    </span>
  );
}

const columns: readonly Column<PendingReport>[] = [
  {
    header: "日付",
    cell: (report) => (
      <Link
        to={`/reports/${report.id}`}
        className="font-bold text-primary underline-offset-4 hover:underline"
      >
        {formatDate(report.report_date)}
      </Link>
    ),
  },
  { header: "担当者", cell: (report) => report.user.name },
  { header: "提出日時", cell: (report) => <SubmittedAt report={report} /> },
  { header: "訪問件数", cell: (report) => `${report.visit_count}件`, align: "right" },
  { header: "合計時間", cell: (report) => formatMinutes(report.total_minutes), align: "right" },
];

function PendingCard({ report }: { report: PendingReport }) {
  return (
    <Link to={`/reports/${report.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-bold">{formatDate(report.report_date)}</span>
        <span className="text-sm">{report.user.name}</span>
      </span>
      <span className="text-sm">
        <SubmittedAt report={report} />
      </span>
      <span className="text-sm text-muted-foreground">
        訪問 {report.visit_count}件 / {formatMinutes(report.total_minutes)}
      </span>
    </Link>
  );
}

/** SCR-06 承認待ち一覧。直属の部下の提出済みの日報を、提出日時の古い順に表示する */
export function ApprovalsPage() {
  const { page } = useListSearch();
  const pending = useQuery({
    queryKey: ["reports", "pending", page],
    queryFn: ({ signal }) =>
      api.get("/reports/pending", {
        query: { page, per_page: PER_PAGE },
        schema: pendingPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">承認待ち一覧</h1>
      {pending.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          承認待ちの日報を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : pending.data ? (
        <>
          <DataList
            caption="承認待ち一覧"
            items={pending.data.items}
            columns={columns}
            getKey={(report) => report.id}
            renderCard={(report) => <PendingCard report={report} />}
            empty="承認待ちの日報はありません"
          />
          <Pagination total={pending.data.pagination.total} />
        </>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
