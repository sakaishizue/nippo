import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { QueryParams } from "./api";
import { pageFrom, searchFor } from "./list-query";

/**
 * 一覧の検索条件とページを、URLのクエリで持つ(画面定義書 3.4)。
 * 検索フォームは searchParams から初期値を作り、検索ボタンで search(条件) を呼ぶ。
 * URLに残るため、詳細画面からブラウザで戻ったときに同じ条件と結果を再現できる
 */
export const useListSearch = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const search = useCallback(
    (conditions: QueryParams) => navigate({ search: searchFor(conditions) }),
    [navigate],
  );
  return { searchParams, page: pageFrom(searchParams), search };
};
