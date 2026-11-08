import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma の CLI(マイグレーションなど)の設定。アプリは src/db.ts で DATABASE_URL に接続する
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // マイグレーションは接続プールを通さず、直接接続のURLを使う。prisma generate では使わないため、未設定でもよい
    url: process.env.DIRECT_URL ?? "",
  },
});
