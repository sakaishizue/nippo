import {
  formatDate,
  formatDateTime,
  formatMinutes,
  REVIEW_ACTION_LABELS,
  type ReportDetail,
  type ReportWorkEntry,
  reportDetailSchema,
  WORK_CATEGORY_LABELS,
} from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { ReportStatusLabel } from "@/components/ReportStatusLabel";
import { buttonVariants } from "@/components/ui/button";
import { api, isApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { CommentForm, ReviewActions } from "./ReportActions";

const positiveId = (value: string | undefined) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** 日報詳細の取得。承認、差し戻し、コメントの後に読み直せるよう、キーをそろえる */
export const reportDetailQueryKey = (id: number | null) => ["reports", "detail", id] as const;

/** 複数行の入力をそのまま表示する。未入力は「未入力」 */
function MultilineText({ value }: { value: string | null }) {
  return value ? (
    <p className="break-words whitespace-pre-wrap">{value}</p>
  ) : (
    <p className="text-muted-foreground">未入力</p>
  );
}

function Section({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-6",
        className,
      )}
    >
      <h2 id={id} className="text-base font-bold md:text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 作業の1件。訪問の場合は顧客、面談相手、訪問内容、次回アクションも表示する */
function WorkEntryItem({ entry, index }: { entry: ReportWorkEntry; index: number }) {
  const headingId = `work-entry-${entry.id}`;
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 id={headingId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="sr-only">作業{index + 1}</span>
        <span className="font-bold">{WORK_CATEGORY_LABELS[entry.category]}</span>
        <span>{formatMinutes(entry.minutes)}</span>
      </h3>
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        {entry.visit && (
          <>
            <dt className="font-bold text-muted-foreground">顧客</dt>
            <dd>
              <Link
                to={`/customers/${entry.visit.customer.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {entry.visit.customer.name}
              </Link>
            </dd>
          </>
        )}
        {entry.deal && (
          <>
            <dt className="font-bold text-muted-foreground">商談</dt>
            <dd>
              <Link
                to={`/deals/${entry.deal.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {entry.deal.name}
              </Link>
            </dd>
          </>
        )}
        {entry.visit && (
          <>
            <dt className="font-bold text-muted-foreground">面談相手</dt>
            <dd className="break-words">{entry.visit.contact_name ?? "未入力"}</dd>
            <dt className="font-bold text-muted-foreground">訪問内容</dt>
            <dd className="break-words whitespace-pre-wrap">{entry.visit.content ?? "未入力"}</dd>
            <dt className="font-bold text-muted-foreground">次回アクション</dt>
            <dd className="break-words whitespace-pre-wrap">
              {entry.visit.next_action ?? "未入力"}
            </dd>
          </>
        )}
        {entry.note && (
          <>
            <dt className="font-bold text-muted-foreground">メモ</dt>
            <dd className="break-words">{entry.note}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

function ReportContent({ report }: { report: ReportDetail }) {
  const { can_edit, can_review, can_comment } = report.permissions;
  return (
    // スマートフォンでは承認と差し戻しのボタンを画面の下に固定するため、その分の余白を空ける
    <div className={cn("flex flex-col gap-5 md:gap-6", can_review && "pb-24 md:pb-0")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{formatDate(report.report_date)}の日報</h1>
        {/* 編集は本人の下書きと差し戻しだけ(permissions.can_edit) */}
        {can_edit && (
          <Link
            to={`/reports/${report.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <PencilIcon aria-hidden="true" />
            編集
          </Link>
        )}
        {/* 承認と差し戻しは直属の上長で提出済みだけ(permissions.can_review)。管理者には出さない */}
        {can_review && <ReviewActions report={report} />}
      </div>

      <Section id="report-info" title="日報の情報">
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-2">
          <dt className="text-sm font-bold text-muted-foreground">日付</dt>
          <dd>{formatDate(report.report_date)}</dd>
          <dt className="text-sm font-bold text-muted-foreground">担当者</dt>
          <dd>{report.user.name}</dd>
          <dt className="text-sm font-bold text-muted-foreground">ステータス</dt>
          <dd>
            <ReportStatusLabel status={report.status} />
          </dd>
          <dt className="text-sm font-bold text-muted-foreground">提出日時</dt>
          <dd>{report.submitted_at ? formatDateTime(report.submitted_at) : "未提出"}</dd>
        </dl>
      </Section>

      <Section
        id="report-work"
        title={
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            作業
            <span className="text-sm font-normal">
              合計時間 <span className="font-bold">{formatMinutes(report.total_minutes)}</span>
            </span>
          </span>
        }
      >
        {report.work_entries.length === 0 ? (
          <p className="text-muted-foreground">作業はありません</p>
        ) : (
          <ul aria-label="作業" className="flex flex-col gap-3">
            {report.work_entries.map((entry, index) => (
              <WorkEntryItem key={entry.id} entry={entry} index={index} />
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-5 md:grid-cols-2 md:gap-6">
        <Section id="report-reflection" title="所感">
          <MultilineText value={report.reflection} />
        </Section>
        <Section id="report-next-plan" title="翌日の予定">
          <MultilineText value={report.next_plan} />
        </Section>
      </div>

      <Section id="report-reviews" title="承認履歴">
        {report.reviews.length === 0 ? (
          <p className="text-muted-foreground">承認、差し戻しの履歴はありません</p>
        ) : (
          <ol aria-label="承認履歴" className="flex flex-col divide-y">
            {report.reviews.map((review) => (
              <li key={review.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={cn(
                      "font-bold",
                      review.action === "returned" ? "text-warning" : "text-success",
                    )}
                  >
                    {REVIEW_ACTION_LABELS[review.action]}
                  </span>
                  <span>{review.reviewer.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(review.created_at)}
                  </span>
                </p>
                {review.reason && (
                  <p className="break-words whitespace-pre-wrap">{review.reason}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section id="report-comments" title="コメント">
        {report.comments.length === 0 ? (
          <p className="text-muted-foreground">コメントはありません</p>
        ) : (
          <ol aria-label="コメント" className="flex flex-col divide-y">
            {report.comments.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-bold">{comment.user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(comment.created_at)}
                  </span>
                </p>
                <p className="break-words whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ol>
        )}
        {/* コメントは本人と直属の上長だけ(permissions.can_comment)。管理者には入力欄を出さない */}
        {can_comment && <CommentForm report={report} />}
      </Section>
    </div>
  );
}

/** SCR-05 日報詳細。閲覧範囲の外の日報は、API が 404 を返すため「ページが見つかりません」を表示する */
export function ReportDetailPage() {
  const reportId = positiveId(useParams().id);
  const report = useQuery({
    queryKey: reportDetailQueryKey(reportId),
    queryFn: ({ signal }) =>
      api.get(`/reports/${reportId}`, { schema: reportDetailSchema, signal }),
    enabled: reportId !== null,
  });

  if (reportId === null || (isApiError(report.error) && report.error.status === 404))
    return <NotFoundPage />;
  if (report.isError) {
    return (
      <p role="alert" className="text-destructive">
        日報を読み込めませんでした。画面を再読み込みしてください。
      </p>
    );
  }
  if (!report.data) return <p className="text-muted-foreground">読み込み中…</p>;
  return <ReportContent report={report.data} />;
}
