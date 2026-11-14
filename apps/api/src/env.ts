import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  // データベースへの同時接続数の上限。ローカルの prisma dev を使うときだけ 1 にする(省略時は pg の既定)
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).optional(),
  // 画面(apps/web のビルド結果)を置いたディレクトリ。本番のイメージでだけ設定する(Dockerfile)
  WEB_DIR: z.string().min(1).optional(),
});
export type Env = z.infer<typeof envSchema>;

/** 環境変数を検証して返す。不足や誤りがあれば、項目名を含むエラーを投げる */
export const loadEnv = (source: Record<string, string | undefined> = process.env): Env => {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`環境変数が正しくありません\n${problems.join("\n")}`);
  }
  return result.data;
};
