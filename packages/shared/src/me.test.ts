import { describe, expect, test } from "vitest";
import { changePasswordFormSchema, changePasswordSchema } from "./me";

const fieldsOf = (input: unknown) => {
  const result = changePasswordSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("changePasswordSchema", () => {
  test("正しい入力は通る", () => {
    expect(fieldsOf({ current_password: "password123", new_password: "newpass12" })).toEqual([]);
  });

  test.each([
    ["新しいパスワードが7文字", { current_password: "password123", new_password: "1234567" }],
    [
      "新しいパスワードが129文字",
      { current_password: "password123", new_password: "a".repeat(129) },
    ],
    [
      "新しいパスワードが現在と同じ",
      { current_password: "password123", new_password: "password123" },
    ],
  ])("%s は new_password のエラー", (_name, input) => {
    expect(fieldsOf(input)).toEqual(["new_password"]);
  });

  test("8文字ちょうどは通る", () => {
    expect(fieldsOf({ current_password: "password123", new_password: "12345678" })).toEqual([]);
  });

  test("現在のパスワードが空なら current_password のエラー", () => {
    expect(fieldsOf({ current_password: "", new_password: "newpass12" })).toEqual([
      "current_password",
    ]);
  });
});

describe("changePasswordFormSchema", () => {
  const issuesOf = (input: unknown) => {
    const result = changePasswordFormSchema.safeParse(input);
    return result.success
      ? []
      : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
  };
  const valid = {
    current_password: "password123",
    new_password: "newpass12",
    new_password_confirmation: "newpass12",
  };

  test("確認用が新しいパスワードと一致すれば通る", () => {
    expect(issuesOf(valid)).toEqual([]);
  });

  test("確認用が一致しなければ new_password_confirmation のエラー", () => {
    expect(issuesOf({ ...valid, new_password_confirmation: "newpass13" })).toEqual([
      ["new_password_confirmation", "新しいパスワードと一致しません"],
    ]);
  });

  test("確認用が空なら、未入力のエラーだけを出す", () => {
    expect(issuesOf({ ...valid, new_password_confirmation: "" })).toEqual([
      ["new_password_confirmation", "確認のため、新しいパスワードをもう一度入力してください"],
    ]);
  });

  test("API と同じチェックもする(現在と同じパスワード)", () => {
    expect(
      issuesOf({
        current_password: "password123",
        new_password: "password123",
        new_password_confirmation: "password123",
      }),
    ).toEqual([["new_password", "現在のパスワードとは違うものにしてください"]]);
  });
});
