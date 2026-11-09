import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;

/**
 * 接続文字列を指定して Prisma のクライアントを作る。アプリは DATABASE_URL(接続プール用)を渡す。
 * poolMax はデータベースへの同時接続数の上限。ローカルの `prisma dev` は同時接続に対応しないため 1 にする
 */
export const createDb = (connectionString: string, poolMax?: number): Db =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString, ...(poolMax !== undefined && { max: poolMax }) }),
  });
