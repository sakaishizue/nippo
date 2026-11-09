import {
  customerDetailSchema,
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  type DealResponse,
  dealSchema,
  dealStageSchema,
  formatDate,
  formatYen,
  paginatedSchema,
  userOptionsSchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { useMe } from "@/auth/me";
import { CustomerCombobox, type CustomerOption } from "@/components/customers/CustomerCombobox";
import { DealStageLabel } from "@/components/DealStageLabel";
import { type Column, DataList } from "@/components/list/DataList";
import { Pagination } from "@/components/list/Pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";
import { cn } from "@/lib/utils";

const dealsPageSchema = paginatedSchema(dealSchema);

/** 担当者を絞り込まない(全員)ことを URL で表す値。一般の初期値は自分のため、全員を明示する */
const ALL_OWNERS = "all";

const amountOf = (deal: DealResponse) => (deal.amount === null ? "" : formatYen(deal.amount));
const closeDateOf = (deal: DealResponse) =>
  deal.expected_close_date ? formatDate(deal.expected_close_date) : "";

const columns: readonly Column<DealResponse>[] = [
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
  {
    header: "顧客名",
    cell: (deal) => (
      <Link to={`/customers/${deal.customer.id}`} className="underline-offset-4 hover:underline">
        {deal.customer.name}
      </Link>
    ),
  },
  { header: "担当者", cell: (deal) => deal.owner.name },
  { header: "ステージ", cell: (deal) => <DealStageLabel stage={deal.stage} /> },
  { header: "見込金額", cell: amountOf, align: "right" },
  { header: "受注予定日", cell: closeDateOf },
];

function DealCard({ deal }: { deal: DealResponse }) {
  return (
    <Link to={`/deals/${deal.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-bold">{deal.name}</span>
        <DealStageLabel stage={deal.stage} />
      </span>
      <span className="text-sm text-muted-foreground">
        {deal.customer.name} / 担当: {deal.owner.name}
      </span>
      {(deal.amount !== null || deal.expected_close_date) && (
        <span className="text-sm text-muted-foreground">
          {[amountOf(deal), closeDateOf(deal) && `受注予定 ${closeDateOf(deal)}`]
            .filter(Boolean)
            .join(" / ")}
        </span>
      )}
    </Link>
  );
}

/** SCR-11 商談一覧 */
export function DealsPage() {
  const me = useMe();
  const { searchParams, page, search } = useListSearch();
  const q = searchParams.get("q") ?? "";
  const customerId = Number(searchParams.get("customer_id")) || null;
  // 担当者の初期値は、一般なら自分(画面定義書 SCR-11)
  const defaultOwner = me.role === "member" ? String(me.id) : ALL_OWNERS;
  const ownerParam = searchParams.get("owner_id") ?? defaultOwner;
  const ownerId = ownerParam === ALL_OWNERS ? null : Number(ownerParam) || null;
  const stages = searchParams.getAll("stage").filter((s) => dealStageSchema.safeParse(s).success);

  // URL の顧客IDから、検索欄に出す顧客名を取る
  const selectedCustomer = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: ({ signal }) =>
      api.get(`/customers/${customerId}`, { schema: customerDetailSchema, signal }),
    enabled: customerId !== null,
  });
  const owners = useQuery({
    queryKey: ["user-options", "member"],
    queryFn: ({ signal }) =>
      api.get("/user-options", { query: { role: "member" }, schema: userOptionsSchema, signal }),
  });
  const deals = useQuery({
    queryKey: ["deals", "list", { q, customerId, ownerId, stages, page }],
    queryFn: ({ signal }) =>
      api.get("/deals", {
        query: {
          q: q || null,
          customer_id: customerId,
          owner_id: ownerId,
          stage: stages,
          page,
          per_page: PER_PAGE,
        },
        schema: dealsPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const onSearch = (event: FormEvent<HTMLFormElement>, customer: CustomerOption | null) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const owner = String(form.get("owner_id"));
    void search({
      q: String(form.get("q")).trim() || null,
      customer_id: customer?.id ?? null,
      // 初期値(一般は自分、それ以外は全員)と同じなら URL に入れない
      owner_id: owner === defaultOwner ? null : owner,
      stage: form.getAll("stage").map(String),
    });
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">商談一覧</h1>
        <Link to="/deals/new" className={cn(buttonVariants(), "font-bold")}>
          <PlusIcon aria-hidden="true" />
          新規登録
        </Link>
      </div>

      {/* 選択欄の初期値を正しく選べるよう、担当者の選択肢と顧客名がそろってから表示する */}
      {owners.isPending || (customerId !== null && selectedCustomer.isPending) ? null : (
        <SearchForm
          key={searchParams.toString()}
          q={q}
          customer={
            selectedCustomer.data
              ? { id: selectedCustomer.data.id, name: selectedCustomer.data.name }
              : null
          }
          ownerParam={ownerParam}
          owners={owners.data?.items ?? []}
          stages={stages}
          onSubmit={onSearch}
        />
      )}

      {deals.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          商談を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : deals.data ? (
        <>
          <DataList
            caption="商談一覧"
            items={deals.data.items}
            columns={columns}
            getKey={(deal) => deal.id}
            renderCard={(deal) => <DealCard deal={deal} />}
            empty="条件に合う商談はありません"
          />
          <Pagination total={deals.data.pagination.total} />
        </>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}

type SearchFormProps = {
  q: string;
  customer: CustomerOption | null;
  ownerParam: string;
  owners: { id: number; name: string }[];
  stages: string[];
  onSubmit: (event: FormEvent<HTMLFormElement>, customer: CustomerOption | null) => void;
};

function SearchForm({
  q,
  customer: initialCustomer,
  ownerParam,
  owners,
  stages,
  onSubmit,
}: SearchFormProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  return (
    <form
      aria-label="商談の検索"
      onSubmit={(event) => onSubmit(event, customer)}
      className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-3 md:p-5"
    >
      <Field>
        <FieldLabel htmlFor="deals-q">商談名</FieldLabel>
        <Input id="deals-q" name="q" type="search" defaultValue={q} />
      </Field>
      <Field>
        <FieldLabel htmlFor="deals-customer">顧客</FieldLabel>
        <CustomerCombobox
          id="deals-customer"
          value={customer}
          onChange={setCustomer}
          placeholder="すべて(顧客名を入力して選択)"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="deals-owner">担当者</FieldLabel>
        <NativeSelect id="deals-owner" name="owner_id" defaultValue={ownerParam} className="w-full">
          <NativeSelectOption value={ALL_OWNERS}>すべて</NativeSelectOption>
          {owners.map((owner) => (
            <NativeSelectOption key={owner.id} value={String(owner.id)}>
              {owner.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm font-bold">ステージ</legend>
        <div className="flex flex-wrap gap-2">
          {DEAL_STAGES.map((stage) => (
            <label
              key={stage}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-4 text-sm has-checked:border-primary has-checked:bg-accent has-checked:font-bold has-checked:text-accent-foreground"
            >
              <input
                type="checkbox"
                name="stage"
                value={stage}
                defaultChecked={stages.includes(stage)}
                className="size-4 accent-primary"
              />
              {DEAL_STAGE_LABELS[stage]}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="self-end font-bold">
        検索
      </Button>
    </form>
  );
}
