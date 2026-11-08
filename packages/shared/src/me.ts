import { z } from "zod";
import { roleSchema } from "./enums";

/** パスワードの長さ。下限は API仕様書の8文字。上限はハッシュ化の負荷を抑えるため */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `${PASSWORD_MIN_LENGTH}文字以上で入力してください` })
  .max(PASSWORD_MAX_LENGTH, { error: `${PASSWORD_MAX_LENGTH}文字以内で入力してください` });

/** PUT /me/password のリクエスト */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, { error: "現在のパスワードを入力してください" }),
    new_password: passwordSchema,
  })
  .refine((data) => data.new_password !== data.current_password, {
    error: "現在のパスワードとは違うものにしてください",
    path: ["new_password"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** GET /me と POST /auth/login のレスポンス */
export const meSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  // 一般のみ。上長と管理者は null
  manager: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  unread_notification_count: z.number().int().min(0),
  csrf_token: z.string(),
});
export type Me = z.infer<typeof meSchema>;

/** GET /me/subordinates のレスポンス */
export const subordinatesSchema = z.object({
  items: z.array(z.object({ id: z.number().int(), name: z.string() })),
});
