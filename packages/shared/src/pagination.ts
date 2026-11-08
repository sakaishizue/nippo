import { z } from "zod";

// API仕様書 1.4 の一覧のページ送り
export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

// クエリ文字列の値は文字列で届くため、数値に変換してから検証する
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(MAX_PER_PAGE),
  total: z.number().int().min(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    pagination: paginationSchema,
  });
