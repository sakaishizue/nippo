import { z } from "zod";

/**
 * ログイン画面(SCR-01)の入力チェック。POST /auth/login のリクエストと同じ項目。
 * 形式の誤りも「メールアドレスまたはパスワードが正しくありません」にするため、API ではこのチェックをしない
 */
export const loginFormSchema = z.object({
  email: z.string().trim().min(1, { error: "メールアドレスを入力してください" }),
  password: z.string().min(1, { error: "パスワードを入力してください" }),
});
export type LoginFormInput = z.infer<typeof loginFormSchema>;

/** ログインに失敗したときの表示(画面定義書 SCR-01)。どちらが誤りかは示さない */
export const LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";
