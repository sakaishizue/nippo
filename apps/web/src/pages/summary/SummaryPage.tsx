import {
  formatMinutes,
  SUMMARY_GROUP_LABELS,
  subordinatesSchema,
  todayInJst,
  type WorkTimeSummary,
  workTimeSummaryQuerySchema,
  workTimeSummarySchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useMe } from "@/auth/me";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { useListSearch } from "@/lib/use-list-search";
import {
  groupOptions,
  type SummarySearch,
  summarySearchFrom,
  summarySearchQuery,
} from "./summary-search";

const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;

/** 集計結果の表。割合は横棒グラフと数値で示す。未分類の行と、最終行に合計を出す(画面定義書 SCR-07) */
function SummaryTable({ summary }: { summary: WorkTimeSummary }) {
  if (summary.items.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        集計の対象になる日報はありません(提出済みと承認済みの日報を集計します)
      </p>
    );
  }
  const label = SUMMARY_GROUP_LABELS[summary.group_by];
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">作業時間の集計({label})</caption>
        <colgroup>
          <col className="w-[38%] md:w-[30%]" />
          <col className="w-[28%] md:w-[18%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b bg-background text-left text-muted-foreground">
            <th scope="col" className="px-3 py-3 font-bold md:px-4">
              項目
            </th>
            <th scope="col" className="px-3 py-3 text-right font-bold md:px-4">
              時間
            </th>
            <th scope="col" className="px-3 py-3 font-bold md:px-4">
              割合
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.items.map((item) => (
            <tr key={item.key === null ? "none" : String(item.key.id)} className="border-b">
              <th scope="row" className="px-3 py-3 text-left font-normal break-words md:px-4">
                {item.key ? item.key.name : <span className="text-muted-foreground">未分類</span>}
              </th>
              <td className="px-3 py-3 text-right whitespace-nowrap md:px-4">
                {formatMinutes(item.minutes)}
              </td>
              <td className="px-3 py-3 md:px-4">
                <div className="flex items-center gap-2">
                  <div aria-hidden="true" className="h-3 min-w-0 flex-1 rounded-full bg-muted">
                    <div
                      className={
                        item.key
                          ? "h-3 rounded-full bg-primary"
                          : "h-3 rounded-full bg-muted-foreground"
                      }
                      style={{ width: percent(item.ratio) }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs">{percent(item.ratio)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-background font-bold">
            <th scope="row" className="px-3 py-3 text-left md:px-4">
              合計
            </th>
            <td className="px-3 py-3 text-right whitespace-nowrap md:px-4">
              {formatMinutes(summary.total_minutes)}
            </td>
            <td className="px-3 py-3 text-xs md:px-4">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** SCR-07 作業時間集計。一般は自分、上長は部下の、提出済みと承認済みの日報の時間を集計する */
export function SummaryPage() {
  const me = useMe();
  const today = todayInJst();
  const isManager = me.role === "manager";
  const { searchParams, search } = useListSearch();
  const conditions = summarySearchFrom(searchParams, me.role, today);
  const parsed = workTimeSummaryQuerySchema.safeParse({
    from: conditions.from,
    to: conditions.to,
    group_by: conditions.groupBy,
    user_id: conditions.userIds,
  });

  const subordinates = useQuery({
    queryKey: ["me", "subordinates"],
    queryFn: ({ signal }) => api.get("/me/subordinates", { schema: subordinatesSchema, signal }),
    enabled: isManager,
  });
  const summary = useQuery({
    queryKey: ["work-time-summary", conditions],
    queryFn: ({ signal }) =>
      api.get("/work-time-summary", {
        query: {
          from: conditions.from,
          to: conditions.to,
          group_by: conditions.groupBy,
          user_id: conditions.userIds,
        },
        schema: workTimeSummarySchema,
        signal,
      }),
    enabled: parsed.success,
    placeholderData: keepPreviousData,
  });

  const allUserIds = (subordinates.data?.items ?? []).map((user) => user.id);
  const onSearch = (next: SummarySearch) =>
    void search(summarySearchQuery(next, me.role, today, allUserIds));
  const conditionError = parsed.success ? null : parsed.error.issues[0]?.message;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">作業時間集計</h1>

      {/* 担当者の選択肢がそろってから表示する(初期値の「全員」を正しく選ぶため) */}
      {isManager && subordinates.isPending ? null : (
        <SearchForm
          key={searchParams.toString()}
          conditions={conditions}
          groups={groupOptions(me.role)}
          users={isManager ? (subordinates.data?.items ?? []) : null}
          onSubmit={onSearch}
        />
      )}

      {conditionError ? (
        <p role="alert" className="text-destructive">
          {conditionError}
        </p>
      ) : summary.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          集計できませんでした。条件を確かめて、もう一度集計してください。
        </p>
      ) : summary.data ? (
        <SummaryTable summary={summary.data} />
      ) : (
        <p className="text-muted-foreground">集計中…</p>
      )}
    </div>
  );
}

type SearchFormProps = {
  conditions: SummarySearch;
  groups: readonly SummarySearch["groupBy"][];
  /** 上長の部下。一般は null(担当者の欄を出さない) */
  users: { id: number; name: string }[] | null;
  onSubmit: (search: SummarySearch) => void;
};

function SearchForm({ conditions, groups, users, onSubmit }: SearchFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const groupBy = String(form.get("group_by")) as SummarySearch["groupBy"];
    onSubmit({
      from: String(form.get("from") ?? ""),
      to: String(form.get("to") ?? ""),
      groupBy: groups.includes(groupBy) ? groupBy : conditions.groupBy,
      userIds: form.getAll("user_id").map(Number),
    });
  };

  return (
    <form
      aria-label="集計の条件"
      onSubmit={submit}
      className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-3 md:p-5"
    >
      <fieldset className="flex min-w-0 flex-col gap-2 md:col-span-2">
        <legend className="mb-2 text-sm font-bold">期間</legend>
        <div className="flex items-center gap-2">
          <Input
            name="from"
            type="date"
            aria-label="期間の開始"
            defaultValue={conditions.from}
            required
            className="min-w-0 flex-1"
          />
          <span aria-hidden="true">〜</span>
          <Input
            name="to"
            type="date"
            aria-label="期間の終了"
            defaultValue={conditions.to}
            required
            className="min-w-0 flex-1"
          />
        </div>
      </fieldset>
      <Field>
        <FieldLabel htmlFor="summary-group">集計の切り口</FieldLabel>
        <NativeSelect
          id="summary-group"
          name="group_by"
          defaultValue={conditions.groupBy}
          className="w-full"
        >
          {groups.map((group) => (
            <NativeSelectOption key={group} value={group}>
              {SUMMARY_GROUP_LABELS[group]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {users && (
        <fieldset className="min-w-0 md:col-span-2">
          <legend className="mb-2 text-sm font-bold">担当者</legend>
          <div className="flex flex-wrap gap-2">
            {users.map((user) => (
              <label
                key={user.id}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-4 text-sm has-checked:border-primary has-checked:bg-accent has-checked:font-bold has-checked:text-accent-foreground"
              >
                <input
                  type="checkbox"
                  name="user_id"
                  value={user.id}
                  // 初期値は全員
                  defaultChecked={
                    conditions.userIds.length === 0 || conditions.userIds.includes(user.id)
                  }
                  className="size-4 accent-primary"
                />
                {user.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Button type="submit" className="self-end font-bold md:col-start-3">
        集計
      </Button>
    </form>
  );
}
