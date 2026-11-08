// 最初の管理者を作るコマンド(要件定義書 F-04)
//   pnpm --filter @nippo/api create-admin --name "管理 太郎" --email admin@example.com
// パスワードは画面で入力する(表示しない)。シェルの履歴に残さないため、引数では受け取らない。
// 端末がない環境では、環境変数 ADMIN_PASSWORD で渡す
import { CreateAdminError, createAdmin } from "../admin/create-admin";
import { createDb } from "../db";
import { parseCreateAdminArgs } from "./create-admin-args";
import { createHiddenPrompt } from "./prompt";

const readPassword = async (): Promise<string> => {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) {
    throw new CreateAdminError(
      "端末から実行してください(パスワードを入力できません)。端末がない場合は ADMIN_PASSWORD で渡します",
    );
  }
  const prompt = createHiddenPrompt();
  try {
    const password = await prompt.ask("パスワード(8文字以上): ");
    const confirmation = await prompt.ask("パスワード(確認): ");
    if (password !== confirmation) throw new CreateAdminError("パスワードが一致しません");
    return password;
  } finally {
    prompt.close();
  }
};

const main = async () => {
  const { name, email } = parseCreateAdminArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) throw new CreateAdminError("DATABASE_URL が設定されていません");
  const password = await readPassword();

  const db = createDb(url);
  try {
    const admin = await createAdmin(db, { name, email, password });
    process.stdout.write(`管理者を作成しました: ${admin.name} <${admin.email}>(ID: ${admin.id})\n`);
  } finally {
    await db.$disconnect();
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // pnpm のエラー表示(ERR_PNPM_...)に埋もれないよう、目印を付けて出す
  process.stderr.write(`\n[create-admin] エラー: ${message}\n\n`);
  process.exitCode = 1;
});
