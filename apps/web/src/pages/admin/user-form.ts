import {
  type CreateUserInput,
  MANAGER_REQUIRED_MESSAGE,
  passwordSchema,
  type Role,
  roleSchema,
  type UpdateUserInput,
  type UserDetailResponse,
  userEmailSchema,
  userNameSchema,
} from "@nippo/shared";
import { z } from "zod";

// SCR-16 ユーザー登録・編集の入力。選択欄の値は文字列で持ち、送るときに API の形にする

export type UserFormMode = "create" | "edit";

const PASSWORD_REQUIRED_MESSAGE = "パスワードを入力してください";

export const userFormSchema = (mode: UserFormMode) =>
  z
    .object({
      name: userNameSchema,
      email: z.string().trim().pipe(userEmailSchema),
      role: roleSchema,
      // 未選択は ""
      manager_id: z.string(),
      // 編集では、空なら再設定しない
      password: z.string(),
      is_active: z.enum(["true", "false"]),
    })
    .check((ctx) => {
      const { role, manager_id, password } = ctx.value;
      if (role === "member" && manager_id === "") {
        ctx.issues.push({
          code: "custom",
          message: MANAGER_REQUIRED_MESSAGE,
          path: ["manager_id"],
          input: manager_id,
        });
      }
      if (mode === "create" && password === "") {
        ctx.issues.push({
          code: "custom",
          message: PASSWORD_REQUIRED_MESSAGE,
          path: ["password"],
          input: password,
        });
        return;
      }
      if (password !== "") {
        for (const issue of passwordSchema.safeParse(password).error?.issues ?? []) {
          ctx.issues.push({
            code: "custom",
            message: issue.message,
            path: ["password"],
            input: password,
          });
        }
      }
    });

export type UserFormInput = z.input<ReturnType<typeof userFormSchema>>;
export type UserFormOutput = z.output<ReturnType<typeof userFormSchema>>;

export type UserRequest = Omit<CreateUserInput, "password"> & Pick<UpdateUserInput, "password">;

/** 入力欄の初期値。登録は有効な一般、編集は今の値(パスワードは空) */
export const userFormDefaults = (user?: UserDetailResponse): UserFormInput => ({
  name: user?.name ?? "",
  email: user?.email ?? "",
  role: user?.role ?? "member",
  manager_id: user?.manager ? String(user.manager.id) : "",
  password: "",
  is_active: user?.is_active === false ? "false" : "true",
});

/** POST /users と PATCH /users/{id} のリクエスト(登録ではパスワードは必ず入る)。上長は一般のときだけ送り、パスワードは入力したときだけ送る */
export const toUserRequest = (values: UserFormOutput): UserRequest => ({
  name: values.name,
  email: values.email,
  role: values.role,
  manager_id: values.role === "member" ? Number(values.manager_id) : null,
  is_active: values.is_active === "true",
  ...(values.password !== "" && { password: values.password }),
});

/** 日報が残っている一般のロールを変えるときは、確認してから保存する(画面定義書 SCR-16) */
export const needsRoleChangeConfirmation = (
  user: UserDetailResponse | undefined,
  role: Role,
): boolean => user !== undefined && user.role === "member" && user.has_reports && role !== "member";
