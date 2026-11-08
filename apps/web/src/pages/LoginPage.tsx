import { zodResolver } from "@hookform/resolvers/zod";
import {
  LOGIN_FAILED_MESSAGE,
  type LoginFormInput,
  loginFormSchema,
  meSchema,
} from "@nippo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { setMe } from "@/auth/me";
import { homePathFor, REDIRECT_PARAM, safeRedirectPath } from "@/auth/redirect";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors, SERVER_ERROR_NAME } from "@/lib/form-errors";

const UNEXPECTED_ERROR_MESSAGE = "ログインできませんでした。時間をおいてやり直してください";

/** SCR-01 ログイン */
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const form = useForm<LoginFormInput>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (input: LoginFormInput) =>
      api.post("/auth/login", { body: input, schema: meSchema }),
    onSuccess: async (me) => {
      // 前にログインしていたユーザーのデータを残さない
      queryClient.clear();
      setMe(queryClient, me);
      // 別の画面から移動してきた場合は、元の画面に戻る
      const to = safeRedirectPath(searchParams.get(REDIRECT_PARAM)) ?? homePathFor(me.role);
      await navigate(to, { replace: true });
    },
    onError: (error) => {
      if (applyServerErrors(error, form.setError)) return;
      const message =
        isApiError(error) && error.status === 401 ? LOGIN_FAILED_MESSAGE : UNEXPECTED_ERROR_MESSAGE;
      form.setError(SERVER_ERROR_NAME, { type: "server", message });
      form.resetField("password", { keepError: false });
    },
  });

  const serverError = form.formState.errors.root?.serverError;

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center p-4">
      <p className="text-center text-sm text-muted-foreground">営業日報</p>
      <h1 className="mt-1 mb-6 text-center text-xl font-bold">ログイン</h1>
      <form noValidate onSubmit={form.handleSubmit((input) => login.mutate(input))}>
        <FieldGroup>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError.message}
            </p>
          )}
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
                  autoComplete="username"
                  aria-invalid={fieldState.invalid}
                  className="h-11"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>パスワード</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  className="h-11"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          {/* 画面定義書 3.2: タップする要素は高さ44px以上 */}
          <Button type="submit" className="h-11 w-full" disabled={login.isPending}>
            {login.isPending ? "ログイン中…" : "ログイン"}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
