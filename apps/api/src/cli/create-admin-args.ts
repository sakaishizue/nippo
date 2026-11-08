import { parseArgs } from "node:util";
import { CreateAdminError } from "../admin/create-admin";

const USAGE = "使い方: create-admin --name <氏名> --email <メールアドレス>";

/** create-admin の引数を読む。--name と --email 以外(--password など)はエラーにする */
export const parseCreateAdminArgs = (args: string[]) => {
  let values: { name?: string | undefined; email?: string | undefined };
  try {
    ({ values } = parseArgs({
      args,
      options: { name: { type: "string" }, email: { type: "string" } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CreateAdminError(
      `${message}\nパスワードは引数では指定できません(画面で入力してください)\n${USAGE}`,
    );
  }
  if (!values.name || !values.email) throw new CreateAdminError(USAGE);
  return { name: values.name, email: values.email };
};
