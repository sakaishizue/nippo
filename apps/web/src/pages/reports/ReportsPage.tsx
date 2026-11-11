import {
  customerDetailSchema,
  formatDate,
  formatMinutes,
  paginatedSchema,
  REPORT_STATUS_LABELS,
  type ReportListItem,
  type Role,
  reportListItemSchema,
  subordinatesSchema,
  todayInJst,
  userOptionsSchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { useMe } from "@/auth/me";
import { CustomerCombobox, type CustomerOption } from "@/components/customers/CustomerCombobox";
import { type Column, DataList } from "@/components/list/DataList";
import { Pagination } from "@/components/list/Pagination";
import { ReportStatusLabel } from "@/components/ReportStatusLabel";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";
import { cn } from "@/lib/utils";
import {
  type ReportSearch,
  reportSearchFrom,
  reportSearchQuery,
  statusOptions,
} from "./report-list";

const reportsPageSchema = paginatedSchema(reportListItemSchema);

const dateLink = (report: ReportListItem) => (
  <Link
    to={`/reports/${report.id}`}
    className="font-bold text-primary underline-offset-4 hover:underline"
  >
    {formatDate(report.report_date)}
  </Link>
);

/** 一覧の項目(画面定義書 SCR-03)。担当者は一般には出さない */
const columnsFor = (role: Role): readonly Column<ReportListItem>[] => [
  { header: "日付", cell: dateLink },
  ...(role === "member"
    ? []
    : [{ header: "担当者", cell: (report: ReportListItem) => report.user.name }]),
  { header: "ステータス", cell: (report) => <ReportStatusLabel status={report.status} /> },
  { header: "訪問件数", cell: (report) => `${report.visit_count}件`, align: "right" },
  { header: "合計時間", cell: (report) => formatMinutes(report.total_minutes), align: "right" },
  { header: "コメント数", cell: (report) => `${report.comment_count}件`, align: "right" },
];

function ReportCard({ report, showUser }: { report: ReportListItem; showUser: boolean }) {
  return (
    <Link to={`/reports/${report.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-bold">{formatDate(report.report_date)}</span>
        <ReportStatusLabel status={report.status} />
      </span>
      {showUser && <span className="text-sm">{report.user.name}</span>}
      <span className="text-sm text-muted-foreground">
        訪問 {report.visit_count}件 / {formatMinutes(report.total_minutes)} / コメント{" "}
        {report.comment_count}件
      </span>
    </Link>
  );
}

/** 担当者の選択肢。上長は部下、管理者は有効な一般の全員。一般は選べない */
const useUserOptions = (role: Role) =>
  useQuery({
    queryKey: role === "manager" ? ["me", "subordinates"] : ["user-options", "member"],
    queryFn: ({ signal }) =>
      role === "manager"
        ? api.get("/me/subordinates", { schema: subordinatesSchema, signal })
        : api.get("/user-options", {
            query: { role: "member" },
            schema: userOptionsSchema,
            signal,
          }),
    enabled: role !== "member",
  });

/** SCR-03 日報一覧 */
export function ReportsPage() {
  const me = useMe();
  const today = todayInJst();
  const { searchParams, page, search } = useListSearch();
  const conditions = reportSearchFrom(searchParams, today);
  const { from, to, userId, customerId, statuses, q } = conditions;

  // URL の顧客IDから、検索欄に出す顧客名を取る
  const selectedCustomer = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: ({ signal }) =>
      api.get(`/customers/${customerId}`, { schema: customerDetailSchema, signal }),
    enabled: customerId !== null,
  });
  const users = useUserOptions(me.role);
  const reports = useQuery({
    queryKey: ["reports", "list", { from, to, userId, customerId, statuses, q, page }],
    queryFn: ({ signal }) =>
      api.get("/reports", {
        query: {
          from: from || null,
          to: to || null,
          user_id: userId,
          customer_id: customerId,
          status: statuses,
          q: q || null,
          page,
          per_page: PER_PAGE,
        },
        schema: reportsPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const onSearch = (next: ReportSearch) => void search(reportSearchQuery(next, today));
  const showUser = me.role !== "member";
  const waiting =
    (me.role !== "member" && users.isPending) ||
    (customerId !== null && selectedCustomer.isPending);

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">日報一覧</h1>
        {me.role === "member" && (
          <Link to="/reports/new" className={cn(buttonVariants(), "font-bold")}>
            <PlusIcon aria-hidden="true" />
            日報を作成
          </Link>
        )}
      </div>

      {/* 選択欄の初期値を正しく選べるよう、担当者の選択肢と顧客名がそろってから表示する */}
      {waiting ? null : (
        <SearchForm
          key={searchParams.toString()}
          role={me.role}
          conditions={conditions}
          customer={
            selectedCustomer.data
              ? { id: selectedCustomer.data.id, name: selectedCustomer.data.name }
              : null
          }
          users={users.data?.items ?? []}
          hasConditions={[...searchParams.keys()].some((key) => key !== "page")}
          onSubmit={onSearch}
        />
      )}

      {reports.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          日報を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : reports.data ? (
        <>
          <DataList
            caption="日報一覧"
            items={reports.data.items}
            columns={columnsFor(me.role)}
            getKey={(report) => report.id}
            renderCard={(report) => <ReportCard report={report} showUser={showUser} />}
            empty="条件に合う日報はありません"
          />
          <Pagination total={reports.data.pagination.total} />
        </>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}

type SearchFormProps = {
  role: Role;
  conditions: ReportSearch;
  customer: CustomerOption | null;
  users: { id: number; name: string }[];
  /** URL に検索条件があるか */
  hasConditions: boolean;
  onSubmit: (search: ReportSearch) => void;
};

function SearchForm({
  role,
  conditions,
  customer: initialCustomer,
  users,
  hasConditions,
  onSubmit,
}: SearchFormProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  // スマートフォンでは検索条件を折りたためる(画面定義書 3.5)。条件を指定しているときは開いておく
  const [open, setOpen] = useState(hasConditions);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userId = Number(form.get("user_id"));
    onSubmit({
      from: String(form.get("from") ?? ""),
      to: String(form.get("to") ?? ""),
      userId: userId > 0 ? userId : null,
      customerId: customer?.id ?? null,
      statuses: statusOptions(role).filter((status) => form.getAll("status").includes(status)),
      q: String(form.get("q") ?? ""),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls="reports-search"
        onClick={() => setOpen(!open)}
        className="md:hidden"
      >
        {open ? "検索条件を閉じる" : "検索条件を開く"}
      </Button>
      <form
        id="reports-search"
        aria-label="日報の検索"
        onSubmit={submit}
        className={cn(
          "grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid md:grid-cols-3 md:p-5",
          !open && "hidden",
        )}
      >
        <fieldset className="flex min-w-0 flex-col gap-2 md:col-span-2">
          <legend className="mb-2 text-sm font-bold">期間</legend>
          <div className="flex items-center gap-2">
            <Input
              name="from"
              type="date"
              aria-label="期間の開始"
              defaultValue={conditions.from}
              max={conditions.to || undefined}
              className="min-w-0 flex-1"
            />
            <span aria-hidden="true">〜</span>
            <Input
              name="to"
              type="date"
              aria-label="期間の終了"
              defaultValue={conditions.to}
              className="min-w-0 flex-1"
            />
          </div>
        </fieldset>
        {role !== "member" && (
          <Field>
            <FieldLabel htmlFor="reports-user">担当者</FieldLabel>
            <NativeSelect
              id="reports-user"
              name="user_id"
              defaultValue={conditions.userId ? String(conditions.userId) : ""}
              className="w-full"
            >
              <NativeSelectOption value="">すべて</NativeSelectOption>
              {users.map((user) => (
                <NativeSelectOption key={user.id} value={String(user.id)}>
                  {user.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="reports-customer">顧客</FieldLabel>
          <CustomerCombobox
            id="reports-customer"
            value={customer}
            onChange={setCustomer}
            placeholder="すべて(顧客名を入力して選択)"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="reports-q">キーワード</FieldLabel>
          <Input
            id="reports-q"
            name="q"
            type="search"
            defaultValue={conditions.q}
            placeholder="所感、翌日の予定、訪問内容など"
          />
        </Field>
        <fieldset className="min-w-0 md:col-span-2">
          <legend className="mb-2 text-sm font-bold">ステータス</legend>
          <div className="flex flex-wrap gap-2">
            {statusOptions(role).map((status) => (
              <label
                key={status}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-4 text-sm has-checked:border-primary has-checked:bg-accent has-checked:font-bold has-checked:text-accent-foreground"
              >
                <input
                  type="checkbox"
                  name="status"
                  value={status}
                  defaultChecked={conditions.statuses.includes(status)}
                  className="size-4 accent-primary"
                />
                {REPORT_STATUS_LABELS[status]}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="self-end font-bold">
          検索
        </Button>
      </form>
    </div>
  );
}
