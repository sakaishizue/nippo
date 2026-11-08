import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";
import { isApiError } from "./api";

/** 項目に結び付かないエラーを入れる React Hook Form の名前 */
export const SERVER_ERROR_NAME = "root.serverError";

/** API の項目名(`work_entries[0].minutes`)を React Hook Form の名前(`work_entries.0.minutes`)にする */
export const toFormFieldName = (field: string): string =>
  field.replace(/\[(\d+)\]/g, ".$1").replace(/^\./, "");

/**
 * `422 VALIDATION_ERROR` の `details` を、React Hook Form の項目のエラーにする。
 * 項目名がない内容は `root.serverError` に入れる。同じ項目に複数の内容があれば最初のものを使う。
 * 反映した場合は true を返す。それ以外のエラーは呼び出し側で扱う
 */
export const applyServerErrors = <T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean => {
  if (!isApiError(error) || error.code !== "VALIDATION_ERROR" || error.details.length === 0) {
    return false;
  }
  const done = new Set<string>();
  for (const detail of error.details) {
    const name = toFormFieldName(detail.field) || SERVER_ERROR_NAME;
    if (done.has(name)) continue;
    // 最初のエラーの項目に移動する
    setError(
      name as FieldPath<T> | `root.${string}`,
      { type: "server", message: detail.message },
      { shouldFocus: done.size === 0 },
    );
    done.add(name);
  }
  return true;
};
