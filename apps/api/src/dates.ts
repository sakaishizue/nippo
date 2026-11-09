/**
 * データベースの日付型(`@db.Date`)の値を `YYYY-MM-DD` にする。
 * Prisma は日付型を UTC の0時の Date で返すため、UTC のまま日付を取り出す(タイムゾーンでずらさない)
 */
export const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);
