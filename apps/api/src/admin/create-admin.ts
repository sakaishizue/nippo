import { passwordSchema } from "@nippo/shared";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import type { Db } from "../db";

// 最初の管理者を作る処理(要件定義書 F-04)。コマンド(src/cli/create-admin.ts)から使う

export const createAdminSchema = z.object({
  name: z.string().trim().min(1, { error: "氏名を入力してください" }).max(50, {
    error: "氏名は50文字以内で入力してください",
  }),
  email: z.email({ error: "メールアドレスの形式が正しくありません" }),
  password: passwordSchema,
});
export type CreateAdminInput = z.input<typeof createAdminSchema>;

/** 入力の誤りや、メールアドレスの重複など、利用者に伝えるエラー */
export class CreateAdminError extends Error {
  override name = "CreateAdminError";
}

export const createAdmin = async (db: Db, input: CreateAdminInput) => {
  const parsed = createAdminSchema.safeParse(input);
  if (!parsed.success) {
    throw new CreateAdminError(parsed.error.issues.map((issue) => issue.message).join("\n"));
  }
  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) {
    throw new CreateAdminError(`${email} は既に登録されています`);
  }
  return db.user.create({
    data: { name, email, role: "admin", passwordHash: await hashPassword(password) },
    select: { id: true, name: true, email: true, role: true },
  });
};
