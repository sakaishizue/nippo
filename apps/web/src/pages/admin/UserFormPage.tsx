import { zodResolver } from "@hookform/resolvers/zod";
import {
  PASSWORD_MIN_LENGTH,
  ROLE_LABELS,
  ROLES,
  type UserDetailResponse,
  userDetailSchema,
  userOptionsSchema,
} from "@nippo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { notifyError, notifySuccess } from "@/components/notify";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors, SERVER_ERROR_NAME } from "@/lib/form-errors";
import { NotFoundPage } from "@/pages/NotFoundPage";
import {
  needsRoleChangeConfirmation,
  toUserRequest,
  type UserFormInput,
  type UserFormMode,
  type UserFormOutput,
  userFormDefaults,
  userFormSchema,
} from "./user-form";

const LIST_PATH = "/admin/users";

type FormProps = { mode: "create"; user?: undefined } | { mode: "edit"; user: UserDetailResponse };

function UserForm({ mode, user }: FormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<UserFormInput, unknown, UserFormOutput>({
    resolver: zodResolver(userFormSchema(mode)),
    defaultValues: userFormDefaults(user),
  });
  const role = useWatch({ control: form.control, name: "role" });
  // 日報が残っている一般のロールを変えるときに、確認のため保存を待たせる入力
  const [confirming, setConfirming] = useState<UserFormOutput | null>(null);

  const managers = useQuery({
    queryKey: ["user-options", "manager"],
    queryFn: ({ signal }) =>
      api.get("/user-options", { query: { role: "manager" }, schema: userOptionsSchema, signal }),
  });
  // 今の上長が無効になっていても、選択欄に表示する
  const managerOptions = [
    ...(managers.data?.items ?? []),
    ...(user?.manager && !managers.data?.items.some((m) => m.id === user.manager?.id)
      ? [user.manager]
      : []),
  ];

  const save = useMutation({
    mutationFn: (values: UserFormOutput) => {
      const body = toUserRequest(values);
      return mode === "create"
        ? api.post("/users", { body, schema: userDetailSchema })
        : api.patch(`/users/${user.id}`, { body, schema: userDetailSchema });
    },
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["user-options"] });
      notifySuccess(mode === "create" ? "ユーザーを登録しました" : "ユーザーを保存しました");
      await navigate(LIST_PATH);
    },
    onError: (error) => {
      setConfirming(null);
      if (applyServerErrors(error, form.setError)) return;
      // 部下がいる上長の変更や、自分自身の変更(409)は、API のメッセージを表示する
      if (isApiError(error) && error.status === 409) {
        form.setError(SERVER_ERROR_NAME, { type: "server", message: error.message });
        return;
      }
      notifyError("保存できませんでした。時間をおいてやり直してください");
    },
  });

  const onSubmit = (values: UserFormOutput) => {
    if (needsRoleChangeConfirmation(user, values.role)) setConfirming(values);
    else save.mutate(values);
  };

  const serverError = form.formState.errors.root?.serverError;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {serverError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          {serverError.message}
        </p>
      )}

      <section className="flex max-w-2xl flex-col rounded-xl border bg-card p-4 shadow-xs md:p-6">
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>氏名</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>50文字以内</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>メールアドレス</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="role"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>ロール</FieldLabel>
                <NativeSelect
                  {...field}
                  id={field.name}
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  {ROLES.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {ROLE_LABELS[value]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {/* 上長は一般のときだけ表示する(画面定義書 SCR-16) */}
          {role === "member" && (
            <Controller
              name="manager_id"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>上長</FieldLabel>
                  <NativeSelect
                    {...field}
                    id={field.name}
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                  >
                    <NativeSelectOption value="">選択してください</NativeSelectOption>
                    {managerOptions.map((manager) => (
                      <NativeSelectOption key={manager.id} value={String(manager.id)}>
                        {manager.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          )}
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>
                  {mode === "create" ? "パスワード" : "パスワードの再設定"}
                </FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  {mode === "create"
                    ? `${PASSWORD_MIN_LENGTH}文字以上`
                    : `入力した場合だけ、パスワードを再設定します(${PASSWORD_MIN_LENGTH}文字以上)。忘れた場合の対応に使います`}
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="is_active"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>状態</FieldLabel>
                <NativeSelect
                  {...field}
                  id={field.name}
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <NativeSelectOption value="true">有効</NativeSelectOption>
                  <NativeSelectOption value="false">無効</NativeSelectOption>
                </NativeSelect>
                <FieldDescription>
                  無効にすると、そのユーザーはログインできなくなります
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
      </section>

      <div className="flex max-w-2xl flex-col-reverse gap-3 md:flex-row md:justify-end">
        <Link to={LIST_PATH} className={buttonVariants({ variant: "outline" })}>
          キャンセル
        </Link>
        <Button type="submit" disabled={save.isPending} className="font-bold md:min-w-32">
          {save.isPending ? "保存中…" : "保存"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title="このユーザーには日報が残っています。ロールを変更しますか?"
        description="変更すると、このユーザーは日報を作成できなくなります。過去の日報は残ります。"
        confirmLabel="変更する"
        pending={save.isPending}
        onConfirm={() => {
          if (confirming) save.mutate(confirming);
        }}
      />
    </form>
  );
}

const TITLES: Record<UserFormMode, string> = {
  create: "ユーザー登録",
  edit: "ユーザー編集",
};

/** SCR-16 ユーザー登録(管理者のみ) */
export function UserCreatePage() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">{TITLES.create}</h1>
      <UserForm mode="create" />
    </div>
  );
}

/** SCR-16 ユーザー編集(管理者のみ) */
export function UserEditPage() {
  const { id } = useParams();
  const userId = Number(id);
  const valid = Number.isInteger(userId) && userId > 0;
  const user = useQuery({
    queryKey: ["users", "detail", userId],
    queryFn: ({ signal }) => api.get(`/users/${userId}`, { schema: userDetailSchema, signal }),
    enabled: valid,
  });

  if (!valid || (isApiError(user.error) && user.error.status === 404)) return <NotFoundPage />;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">{TITLES.edit}</h1>
      {user.isError ? (
        <p role="alert" className="text-destructive">
          ユーザーを読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : user.data ? (
        // 別のユーザーを開いたときに入力欄を作り直す
        <UserForm key={user.data.id} mode="edit" user={user.data} />
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
