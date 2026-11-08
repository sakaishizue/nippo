import type { Db } from "../db";

let tables: string[] | undefined;

/** マイグレーションの管理用以外の全テーブルを空にし、ID の連番も1に戻す */
export const truncateAll = async (db: Db): Promise<void> => {
  tables ??= (
    await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  ).map((row) => `"${row.tablename}"`);
  if (tables.length === 0) return;
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
};
