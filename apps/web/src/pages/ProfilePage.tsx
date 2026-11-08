import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ChangePasswordFormInput,
  changePasswordFormSchema,
  PASSWORD_MIN_LENGTH,
  ROLE_LABELS,
} from "@nippo/shared";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useMe } from "@/auth/me";
import { notifyError, notifySuccess } from "@/components/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";

const EMPTY: ChangePasswordFormInput = {
  current_password: "",
  new_password: "",
  new_password_confirmation: "",
};

type PasswordField = {
  name: keyof ChangePasswordFormInput;
  label: string;
  autoComplete: "current-password" | "new-password";
  description?: string;
};

const PASSWORD_FIELDS: readonly PasswordField[] = [
  { name: "current_password", label: "現在のパスワード", autoComplete: "current-password" },
  {
    name: "new_password",
    label: "新しいパスワード",
    autoComplete: "new-password",
    description: `${PASSWORD_MIN_LENGTH}文字以上。現在のパスワードと同じものは使えません`,
  },
  {
    name: "new_password_confirmation",
    label: "新しいパスワード(確認)",
    autoComplete: "new-password",
  },
];

/** SCR-17 プロフィール */
export function ProfilePage() {
  const me = useMe();
  const form = useForm<ChangePasswordFormInput>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: EMPTY,
  });

  const changePassword = useMutation({
    // 確認用は画面だけで使い、API には送らない
    mutationFn: ({ current_password, new_password }: ChangePasswordFormInput) =>
      api.put("/me/password", { body: { current_password, new_password } }),
    onSuccess: () => {
      form.reset(EMPTY);
      notifySuccess("パスワードを変更しました");
    },
    onError: (error) => {
      if (!applyServerErrors(error, form.setError)) {
        notifyError("パスワードを変更できませんでした。時間をおいてやり直してください");
      }
    },
  });

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">プロフィール</h1>

      <section
        aria-labelledby="profile-info"
        className="flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs md:p-6"
      >
        <h2 id="profile-info" className="text-base font-bold md:text-lg">
          登録内容
        </h2>
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-base">
          <dt className="text-sm font-bold text-muted-foreground">氏名</dt>
          <dd>{me.name}</dd>
          <dt className="text-sm font-bold text-muted-foreground">メールアドレス</dt>
          <dd className="break-all">{me.email}</dd>
          <dt className="text-sm font-bold text-muted-foreground">ロール</dt>
          <dd>{ROLE_LABELS[me.role]}</dd>
          {me.manager && (
            <>
              <dt className="text-sm font-bold text-muted-foreground">上長</dt>
              <dd>{me.manager.name}</dd>
            </>
          )}
        </dl>
        <p className="text-sm text-muted-foreground">
          登録内容の変更は、管理者に依頼してください。
        </p>
      </section>

      <section
        aria-labelledby="profile-password"
        className="flex max-w-2xl flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs md:p-6"
      >
        <h2 id="profile-password" className="text-base font-bold md:text-lg">
          パスワードの変更
        </h2>
        <form
          noValidate
          onSubmit={form.handleSubmit((input) => changePassword.mutate(input))}
          className="flex flex-col gap-5"
        >
          <FieldGroup>
            {PASSWORD_FIELDS.map((item) => (
              <Controller
                key={item.name}
                name={item.name}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>{item.label}</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="password"
                      autoComplete={item.autoComplete}
                      aria-invalid={fieldState.invalid}
                    />
                    {item.description && <FieldDescription>{item.description}</FieldDescription>}
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>
          <Button
            type="submit"
            disabled={changePassword.isPending}
            className="w-full font-bold md:w-auto md:self-start"
          >
            {changePassword.isPending ? "変更中…" : "パスワードを変更"}
          </Button>
        </form>
      </section>
    </div>
  );
}
