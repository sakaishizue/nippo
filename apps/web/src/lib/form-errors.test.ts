import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { applyServerErrors, toFormFieldName } from "./form-errors";

describe("toFormFieldName", () => {
  it.each([
    ["reflection", "reflection"],
    ["work_entries[0].minutes", "work_entries.0.minutes"],
    ["work_entries[12].visit.customer_id", "work_entries.12.visit.customer_id"],
    ["work_entries", "work_entries"],
    ["[0].name", "0.name"],
    ["", ""],
  ])("%s を %s にする", (field, name) => {
    expect(toFormFieldName(field)).toBe(name);
  });
});

describe("applyServerErrors", () => {
  const validationError = (details: { field: string; message: string }[]) =>
    new ApiError(422, "VALIDATION_ERROR", "入力内容に誤りがあります", { details });

  it("details を項目のエラーにし、最初の項目にだけ移動する", () => {
    const setError = vi.fn();
    const handled = applyServerErrors(
      validationError([
        { field: "work_entries[0].minutes", message: "1以上の整数を入力してください" },
        { field: "reflection", message: "2000文字以内で入力してください" },
      ]),
      setError,
    );
    expect(handled).toBe(true);
    expect(setError.mock.calls).toEqual([
      [
        "work_entries.0.minutes",
        { type: "server", message: "1以上の整数を入力してください" },
        { shouldFocus: true },
      ],
      [
        "reflection",
        { type: "server", message: "2000文字以内で入力してください" },
        { shouldFocus: false },
      ],
    ]);
  });

  it("同じ項目に複数の内容があれば、最初のものだけを使う", () => {
    const setError = vi.fn();
    applyServerErrors(
      validationError([
        { field: "email", message: "メール形式で入力してください" },
        { field: "email", message: "登録されています" },
      ]),
      setError,
    );
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError.mock.calls[0]?.[1]).toEqual({
      type: "server",
      message: "メール形式で入力してください",
    });
  });

  it("項目名がない内容は root.serverError に入れる", () => {
    const setError = vi.fn();
    applyServerErrors(validationError([{ field: "", message: "内容が不正です" }]), setError);
    expect(setError).toHaveBeenCalledWith(
      "root.serverError",
      { type: "server", message: "内容が不正です" },
      { shouldFocus: true },
    );
  });

  it.each([
    ["422 以外の ApiError", new ApiError(409, "INVALID_STATUS", "提出済みです")],
    ["details が空の 422", validationError([])],
    ["ApiError 以外", new Error("network")],
  ])("%s は反映せず false を返す", (_, error) => {
    const setError = vi.fn();
    expect(applyServerErrors(error, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
