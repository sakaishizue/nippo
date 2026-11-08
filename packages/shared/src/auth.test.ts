import { describe, expect, it } from "vitest";
import { loginFormSchema } from "./auth";

describe("loginFormSchema", () => {
  it("メールアドレスの前後の空白を除く", () => {
    expect(loginFormSchema.parse({ email: " u1@example.com ", password: "x" })).toEqual({
      email: "u1@example.com",
      password: "x",
    });
  });

  it("未入力の項目ごとにメッセージを返す", () => {
    const result = loginFormSchema.safeParse({ email: "  ", password: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["email", "メールアドレスを入力してください"],
      ["password", "パスワードを入力してください"],
    ]);
  });
});
