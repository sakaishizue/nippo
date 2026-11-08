import { buildQuery, type QueryParams } from "./api";

/** 一覧の1ページの件数(画面定義書 3.4) */
export const PER_PAGE = 20;
export const PAGE_PARAM = "page";

/** URLのクエリからページ番号を読む。不正な値は1ページ目にする */
export const pageFrom = (searchParams: URLSearchParams): number => {
  const page = Number(searchParams.get(PAGE_PARAM));
  return Number.isInteger(page) && page >= 1 ? page : 1;
};

/** ページ送りの表示に使う値。表示中の件数の範囲(1始まり)と、最後のページ */
export const pageRange = (page: number, perPage: number, total: number) => {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    from: total === 0 ? 0 : Math.min((page - 1) * perPage + 1, total),
    to: Math.min(page * perPage, total),
    lastPage,
    hasPrev: page > 1,
    hasNext: page < lastPage,
  };
};

/** 検索条件を残したまま、ページだけを変えたクエリ文字列を返す。1ページ目は page を付けない */
export const searchWithPage = (searchParams: URLSearchParams, page: number): string => {
  const next = new URLSearchParams(searchParams);
  if (page <= 1) next.delete(PAGE_PARAM);
  else next.set(PAGE_PARAM, String(page));
  const query = next.toString();
  return query === "" ? "" : `?${query}`;
};

/**
 * 検索条件をクエリ文字列にする。条件を変えたら1ページ目に戻すため、page は付けない。
 * 検索条件をURLに持つことで、詳細画面から戻ったときに同じ条件と結果を再現する(画面定義書 3.4)
 */
export const searchFor = (conditions: QueryParams): string => {
  const { [PAGE_PARAM]: _page, ...rest } = conditions;
  return buildQuery(rest);
};
