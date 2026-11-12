import {
  type SummaryGroup,
  WORK_CATEGORY_LABELS,
  type WorkCategory,
  type WorkTimeSummary,
  type WorkTimeSummaryQuery,
} from "@nippo/shared";
import { Prisma, type User } from "../generated/prisma/client";
import type { Db } from "./db";
import { AppError } from "./errors";

// 作業時間の集計(F-34、API仕様書 6章)

/** 集計の切り口ごとの、グループの値。対象外(未分類)は NULL になる */
const KEY_COLUMN: Record<SummaryGroup, Prisma.Sql> = {
  user: Prisma.sql`dr.user_id::text`,
  // 顧客別は訪問の作業のみ。訪問の詳細がない作業は未分類
  customer: Prisma.sql`v.customer_id::text`,
  // 商談別は商談を紐づけた作業のみ
  deal: Prisma.sql`we.deal_id::text`,
  category: Prisma.sql`we.category::text`,
};

const validationError = (field: string, message: string) =>
  new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", { details: [{ field, message }] });

/**
 * 集計する担当者。一般は自分、上長は直属の部下(user_id を指定すればその人だけ)。
 * 上長の部下には無効なユーザーも含める(過去の作業時間を集計できるように)
 */
const targetUserIds = async (
  db: Db,
  viewer: Pick<User, "id" | "role">,
  query: WorkTimeSummaryQuery,
): Promise<number[]> => {
  if (viewer.role === "member") {
    // 一般は自分の日報だけのため、担当者別は選べない(SUM-05)
    if (query.group_by === "user") {
      throw validationError("group_by", "担当者別の集計は上長だけが使えます");
    }
    return [viewer.id];
  }
  const subordinates = await db.user.findMany({
    where: { managerId: viewer.id, role: "member" },
    select: { id: true },
  });
  const ids = subordinates.map((user) => user.id);
  if (!query.user_id || query.user_id.length === 0) return ids;
  // 部下以外を指定した場合は 422(SUM-08)
  if (query.user_id.some((id) => !ids.includes(id))) {
    throw validationError("user_id", "部下以外の担当者は指定できません");
  }
  return [...new Set(query.user_id)];
};

/** グループの名前。担当者、顧客、商談はまとめて読み込む */
const namesOf = async (
  db: Db,
  group: SummaryGroup,
  ids: string[],
): Promise<Map<string, { id: number | WorkCategory; name: string }>> => {
  if (group === "category") {
    return new Map(
      ids.map((id) => [
        id,
        { id: id as WorkCategory, name: WORK_CATEGORY_LABELS[id as WorkCategory] },
      ]),
    );
  }
  const numbers = ids.map(Number);
  const select = { id: true, name: true } as const;
  const rows =
    group === "user"
      ? await db.user.findMany({ where: { id: { in: numbers } }, select })
      : group === "customer"
        ? await db.customer.findMany({ where: { id: { in: numbers } }, select })
        : await db.deal.findMany({ where: { id: { in: numbers } }, select });
  return new Map(rows.map((row) => [String(row.id), row]));
};

/**
 * 作業時間を集計する。対象は提出済みと承認済みの日報(SUM-01)。集計はデータベースで行う。
 * 時間の多い順に並べ、未分類(key が null)は最後にする
 */
export const summarizeWorkTime = async (
  db: Db,
  viewer: Pick<User, "id" | "role">,
  query: WorkTimeSummaryQuery,
): Promise<WorkTimeSummary> => {
  const userIds = await targetUserIds(db, viewer, query);
  const rows =
    userIds.length === 0
      ? []
      : await db.$queryRaw<{ key: string | null; minutes: number }[]>`
          SELECT ${KEY_COLUMN[query.group_by]} AS key, SUM(we.minutes)::int AS minutes
          FROM work_entries we
          JOIN daily_reports dr ON dr.id = we.report_id
          LEFT JOIN visits v ON v.work_entry_id = we.id
          WHERE dr.status IN ('submitted', 'approved')
            AND dr.report_date BETWEEN ${query.from}::date AND ${query.to}::date
            AND dr.user_id = ANY(${userIds})
          GROUP BY 1`;

  const names = await namesOf(
    db,
    query.group_by,
    rows.flatMap((row) => (row.key === null ? [] : [row.key])),
  );
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  const items = rows
    .map((row) => ({
      key: row.key === null ? null : (names.get(row.key) ?? null),
      minutes: row.minutes,
      ratio: total === 0 ? 0 : row.minutes / total,
    }))
    .sort((a, b) => {
      // 未分類は最後。同じ時間なら名前の順
      if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
      return b.minutes - a.minutes || (a.key?.name ?? "").localeCompare(b.key?.name ?? "", "ja");
    });
  return { group_by: query.group_by, total_minutes: total, items };
};
