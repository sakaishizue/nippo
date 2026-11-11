import {
  formatDate,
  formatMinutes,
  type ManagerDashboard,
  type MemberDashboard,
  managerDashboardSchema,
  memberDashboardSchema,
  type ReportStatus,
} from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import type { z } from "zod";
import { useMe } from "@/auth/me";
import { ReportStatusLabel } from "@/components/ReportStatusLabel";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs md:p-6"
    >
      <h2 id={id} className="text-base font-bold md:text-lg">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 一覧の1行を丸ごとリンクにする */
function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="flex min-h-11 items-center gap-3 px-1 py-2.5 hover:bg-muted md:px-2">
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{children}</span>
      <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** 一般のホーム: 今日の日報、差し戻し中の日報、最近の日報(画面定義書 SCR-02) */
function MemberHome({ data }: { data: MemberDashboard }) {
  const today = data.today_report;
  const editable = today?.status === "draft" || today?.status === "returned";
  return (
    <>
      <Section id="home-today" title="今日の日報">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {today ? (
            <ReportStatusLabel status={today.status} />
          ) : (
            <span className="font-bold text-muted-foreground">未作成</span>
          )}
          {!today ? (
            <Link to="/reports/new" className={cn(buttonVariants(), "font-bold")}>
              作成する
            </Link>
          ) : editable ? (
            <Link to={`/reports/${today.id}/edit`} className={cn(buttonVariants(), "font-bold")}>
              続きを書く
            </Link>
          ) : (
            <Link to={`/reports/${today.id}`} className={buttonVariants({ variant: "outline" })}>
              日報を見る
            </Link>
          )}
        </div>
      </Section>

      {data.returned_reports.length > 0 && (
        <Section id="home-returned" title="差し戻し中の日報">
          <ul aria-labelledby="home-returned" className="flex flex-col divide-y">
            {data.returned_reports.map((report) => (
              <li key={report.id}>
                {/* 差し戻しは直して再提出するため、日報入力を開く */}
                <RowLink to={`/reports/${report.id}/edit`}>
                  <span className="font-bold">{formatDate(report.report_date)}</span>
                  <span className="w-full text-sm break-words text-muted-foreground">
                    {report.reason ?? "理由なし"}
                  </span>
                </RowLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="home-recent" title="最近の日報">
        {data.recent_reports.length === 0 ? (
          <p className="text-muted-foreground">直近7日の日報はありません</p>
        ) : (
          <ul aria-labelledby="home-recent" className="flex flex-col divide-y">
            {data.recent_reports.map((report) => (
              <li key={report.id}>
                <RowLink to={`/reports/${report.id}`}>
                  <span className="font-bold">{formatDate(report.report_date)}</span>
                  <ReportStatusLabel status={report.status} />
                  <span className="text-sm text-muted-foreground">
                    {formatMinutes(report.total_minutes)}
                  </span>
                </RowLink>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/** 部下のその日の提出状況。日報があれば詳細へのリンクにする */
function SubordinateReport({
  report,
  label,
}: {
  report: { report_id: number; status: ReportStatus } | null;
  label: string;
}) {
  if (!report) return <span className="text-sm text-muted-foreground">未提出</span>;
  return (
    <Link
      to={`/reports/${report.report_id}`}
      aria-label={`${label}の日報`}
      className="inline-flex min-h-11 items-center"
    >
      <ReportStatusLabel status={report.status} />
    </Link>
  );
}

/** 上長のホーム: 承認待ちの件数、部下の提出状況(画面定義書 SCR-02) */
function ManagerHome({ data }: { data: ManagerDashboard }) {
  return (
    <>
      <Section id="home-pending" title="承認待ち">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            <span className="text-2xl font-bold">{data.pending_count}</span> 件
          </p>
          <Link to="/approvals" className={cn(buttonVariants(), "font-bold")}>
            承認待ち一覧へ
          </Link>
        </div>
      </Section>

      <Section id="home-subordinates" title="部下の提出状況">
        {data.subordinates.length === 0 ? (
          <p className="text-muted-foreground">部下がいません</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">部下の提出状況</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-bold">
                  担当者
                </th>
                <th scope="col" className="py-2 pr-3 font-bold">
                  前営業日
                </th>
                <th scope="col" className="py-2 font-bold">
                  今日
                </th>
              </tr>
            </thead>
            <tbody>
              {data.subordinates.map(({ user, previous_business_day, today }) => (
                <tr key={user.id} className="border-b last:border-b-0">
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {user.name}
                  </th>
                  <td className="py-1 pr-3">
                    <SubordinateReport
                      report={previous_business_day}
                      label={`${user.name}の前営業日`}
                    />
                  </td>
                  <td className="py-1">
                    <SubordinateReport report={today} label={`${user.name}の今日`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}

/** ホームの内容(GET /dashboard)を読み込んで表示する。ロールによってレスポンスの形が違う */
function Dashboard<T>({
  schema,
  render,
}: {
  schema: z.ZodType<T>;
  render: (data: T) => ReactNode;
}) {
  const me = useMe();
  const dashboard = useQuery({
    queryKey: ["dashboard", me.role],
    queryFn: ({ signal }) => api.get("/dashboard", { schema, signal }),
  });
  if (dashboard.isError) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
      >
        ホームの内容を読み込めませんでした。画面を再読み込みしてください。
      </p>
    );
  }
  if (!dashboard.data) return <p className="text-muted-foreground">読み込み中…</p>;
  return render(dashboard.data);
}

/** SCR-02 ホーム。一般と上長で内容が違う。管理者はユーザー一覧へ移動する */
export function HomePage() {
  const me = useMe();
  if (me.role === "admin") return <Navigate to="/admin/users" replace />;
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">ホーム</h1>
      {me.role === "manager" ? (
        <Dashboard schema={managerDashboardSchema} render={(data) => <ManagerHome data={data} />} />
      ) : (
        <Dashboard schema={memberDashboardSchema} render={(data) => <MemberHome data={data} />} />
      )}
    </div>
  );
}
