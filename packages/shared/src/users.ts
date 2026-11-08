import { z } from "zod";
import { roleSchema } from "./enums";
import { passwordSchema } from "./me";
import { paginationQuerySchema } from "./pagination";

// API仕様書 10章(ユーザー)の入力と出力

export const userNameSchema = z
  .string()
  .trim()
  .min(1, { error: "氏名を入力してください" })
  .max(50, { error: "氏名は50文字以内で入力してください" });

export const userEmailSchema = z.email({ error: "メールアドレスの形式が正しくありません" });

const managerIdSchema = z.number().int().positive().nullable();

export const MANAGER_REQUIRED_MESSAGE = "一般のユーザーには上長を選んでください";
export const MANAGER_NOT_ALLOWED_MESSAGE = "上長を設定できるのは一般のユーザーだけです";

/** POST /users のリクエスト */
export const createUserSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    role: roleSchema,
    manager_id: managerIdSchema.default(null),
    password: passwordSchema,
    is_active: z.boolean(),
  })
  .check((ctx) => {
    const { role, manager_id } = ctx.value;
    if (role === "member" && manager_id === null) {
      ctx.issues.push({
        code: "custom",
        message: MANAGER_REQUIRED_MESSAGE,
        path: ["manager_id"],
        input: manager_id,
      });
    }
    if (role !== "member" && manager_id !== null) {
      ctx.issues.push({
        code: "custom",
        message: MANAGER_NOT_ALLOWED_MESSAGE,
        path: ["manager_id"],
        input: manager_id,
      });
    }
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * PATCH /users/{id} のリクエスト。送った項目だけを更新する。
 * ロールと上長の組み合わせは、今の値と合わせて API 側で確かめる
 */
export const updateUserSchema = z
  .object({
    name: userNameSchema,
    email: userEmailSchema,
    role: roleSchema,
    manager_id: managerIdSchema,
    password: passwordSchema,
    is_active: z.boolean(),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** GET /users のクエリ */
export const userListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  role: roleSchema.optional(),
  // 初期値は有効なユーザーだけ
  is_active: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

/** GET /user-options のクエリ */
export const userOptionsQuerySchema = z.object({
  role: z.enum(["member", "manager"]),
});

const userRefSchema = z.object({ id: z.number().int(), name: z.string() });

/** GET /users の1件分。パスワードは返さない */
export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  manager: userRefSchema.nullable(),
  is_active: z.boolean(),
});
export type UserResponse = z.infer<typeof userSchema>;

/** GET /users/{id}。日報が1件でもあれば has_reports が true(画面定義書 SCR-16 の警告に使う) */
export const userDetailSchema = userSchema.extend({
  has_reports: z.boolean(),
});
export type UserDetailResponse = z.infer<typeof userDetailSchema>;

export const userOptionsSchema = z.object({ items: z.array(userRefSchema) });
