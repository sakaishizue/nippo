import { describe, expect, test } from "vitest";
import { changePasswordSchema } from "./me";

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
