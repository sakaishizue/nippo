import { paginatedSchema, ROLE_LABELS, ROLES, type UserResponse, userSchema } from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import type { FormEvent } from "react";
import { Link } from "react-router";
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

const usersPageSchema = paginatedSchema(userSchema);

/** 状態の初期値は有効(画面定義書 SCR-15)。初期値は URL に入れない */
const ACTIVE_DEFAULT = "true";

function StatusLabel({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 text-xs leading-6 font-bold",
        active ? "bg-success-surface text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "有効" : "無効"}
    </span>
  );
}

/** 上長は一般のみ表示する(画面定義書 SCR-15) */
const managerOf = (user: UserResponse) =>
  user.role === "member" ? (user.manager?.name ?? "") : "";

const columns: readonly Column<UserResponse>[] = [
  {
    header: "氏名",
    cell: (user) => (
      <Link
        to={`/admin/users/${user.id}`}
        className="font-bold text-primary underline-offset-4 hover:underline"
      >
        {user.name}
      </Link>
    ),
  },
  { header: "メールアドレス", cell: (user) => <span className="break-all">{user.email}</span> },
  { header: "ロール", cell: (user) => ROLE_LABELS[user.role] },
  { header: "上長", cell: managerOf },
  { header: "状態", cell: (user) => <StatusLabel active={user.is_active} /> },
];

function UserCard({ user }: { user: UserResponse }) {
  const manager = managerOf(user);
  return (
    <Link to={`/admin/users/${user.id}`} className="flex flex-col gap-1 px-4 py-3.5">
      <span className="flex items-center gap-2">
        <span className="flex-1 font-bold">{user.name}</span>
        <StatusLabel active={user.is_active} />
      </span>
      <span className="text-sm break-all text-muted-foreground">{user.email}</span>
      <span className="text-sm text-muted-foreground">
        {ROLE_LABELS[user.role]}
        {manager && ` / 上長: ${manager}`}
      </span>
    </Link>
  );
}

/** SCR-15 ユーザー一覧(管理者のみ) */
export function UsersPage() {
  const { searchParams, page, search } = useListSearch();
  const q = searchParams.get("q") ?? "";
  const role = searchParams.get("role") ?? "";
  const isActive = searchParams.get("is_active") ?? ACTIVE_DEFAULT;

  const users = useQuery({
    queryKey: ["users", { q, role, isActive, page }],
    queryFn: ({ signal }) =>
      api.get("/users", {
        query: { q: q || null, role: role || null, is_active: isActive, page, per_page: PER_PAGE },
        schema: usersPageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextActive = String(form.get("is_active"));
    void search({
      q: String(form.get("q")).trim() || null,
      role: String(form.get("role")) || null,
      is_active: nextActive === ACTIVE_DEFAULT ? null : nextActive,
    });
  };

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">ユーザー一覧</h1>
        <Link to="/admin/users/new" className={cn(buttonVariants(), "font-bold")}>
          <PlusIcon aria-hidden="true" />
          新規登録
        </Link>
      </div>

      {/* 戻ったときに検索条件を再現するため、URL が変わったら入力欄を作り直す */}
      <form
        key={searchParams.toString()}
        aria-label="ユーザーの検索"
        onSubmit={onSearch}
        className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end md:p-5"
      >
        <Field>
          <FieldLabel htmlFor="users-q">氏名、メールアドレス</FieldLabel>
          <Input id="users-q" name="q" type="search" defaultValue={q} />
        </Field>
        <Field>
          <FieldLabel htmlFor="users-role">ロール</FieldLabel>
          <NativeSelect id="users-role" name="role" defaultValue={role} className="w-full">
            <NativeSelectOption value="">すべて</NativeSelectOption>
            {ROLES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {ROLE_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="users-active">状態</FieldLabel>
          <NativeSelect
            id="users-active"
            name="is_active"
            defaultValue={isActive}
            className="w-full"
          >
            <NativeSelectOption value="true">有効</NativeSelectOption>
            <NativeSelectOption value="false">無効</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button type="submit" className="font-bold">
          検索
        </Button>
      </form>

      {users.isError ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          ユーザーを読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : users.data ? (
        <>
          <DataList
            caption="ユーザー一覧"
            items={users.data.items}
            columns={columns}
            getKey={(user) => user.id}
            renderCard={(user) => <UserCard user={user} />}
            empty="条件に合うユーザーはいません"
          />
          <Pagination total={users.data.pagination.total} />
        </>
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
