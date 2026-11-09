import {
  type CustomerListItem,
  customerListItemSchema,
  formatDate,
  paginatedSchema,
} from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { type Column, DataList } from "@/components/list/DataList";
import { Pagination } from "@/components/list/Pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { PER_PAGE } from "@/lib/list-query";
import { useListSearch } from "@/lib/use-list-search";
import { cn } from "@/lib/utils";

const customersPageSchema = paginatedSchema(customerListItemSchema);

const lastVisit = (customer: CustomerListItem) =>
  customer.last_visited_on ? formatDate(customer.last_visited_on) : "なし";

const columns: readonly Column<CustomerListItem>[] = [
  {
    header: "顧客名",
    cell: (customer) => (
      <Link
        to={`/customers/${customer.id}`}
        className="font-bold text-primary underline-offset-4 hover:underline"
      >
        {customer.name}
      </Link>
    ),
  },
  { header: "住所", cell: (customer) => customer.address ?? "" },
  { header: "電話番号", cell: (customer) => customer.phone ?? "" },
  { header: "商談数", cell: (customer) => `${customer.deal_count}件`, align: "right" },
  { header: "最終訪問日", cell: lastVisit },
];

function CustomerCard({ customer }: { customer: CustomerListItem }) {
  return (
    <Link to={`/customers/${customer.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="font-bold">{customer.name}</span>
      {customer.address && (
        <span className="text-sm text-muted-foreground">{customer.address}</span>
      )}
      <span className="text-sm text-muted-foreground">
        商談 {customer.deal_count}件 / 最終訪問 {lastVisit(customer)}
      </span>
    </Link>
  );
}

/** SCR-08 顧客一覧 */
export function CustomersPage() {
  const { searchParams, page, search } = useListSearch();
  const q = searchParams.get("q") ?? "";

  const customers = useQuery({
    queryKey: ["customers", "list", { q, page }],
    queryFn: ({ signal }) =>
      api.get("/customers", {
        query: { q: q || null, page, per_page: PER_PAGE },
        schema: customersPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void search({ q: String(form.get("q")).trim() || null });
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">顧客一覧</h1>
        <Link to="/customers/new" className={cn(buttonVariants(), "font-bold")}>
          <PlusIcon aria-hidden="true" />
          新規登録
        </Link>
      </div>

      <form
        key={searchParams.toString()}
        aria-label="顧客の検索"
        onSubmit={onSearch}
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-5"
      >
        <Field>
          <FieldLabel htmlFor="customers-q">顧客名</FieldLabel>
          <Input id="customers-q" name="q" type="search" defaultValue={q} />
        </Field>
        <Button type="submit" className="font-bold">
          検索
        </Button>
      </form>

      {customers.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          顧客を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : customers.data ? (
        <>
          <DataList
            caption="顧客一覧"
            items={customers.data.items}
            columns={columns}
            getKey={(customer) => customer.id}
            renderCard={(customer) => <CustomerCard customer={customer} />}
            empty="条件に合う顧客はいません"
          />
          <Pagination total={customers.data.pagination.total} />
        </>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
