import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export type Db = PrismaClient;

/** 接続文字列を指定して Prisma のクライアントを作る。アプリは DATABASE_URL(接続プール用)を渡す */
export const createDb = (connectionString: string): Db =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
