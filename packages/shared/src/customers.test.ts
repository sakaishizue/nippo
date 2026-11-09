import { describe, expect, it } from "vitest";
import { customerInputSchema } from "./customers";

describe("customerInputSchema", () => {
  it("前後の空白を除き、空の住所と電話番号は null にする", () => {
    expect(customerInputSchema.parse({ name: " A株式会社 ", address: "  ", phone: "" })).toEqual({
      name: "A株式会社",
      address: null,
      phone: null,
      confirm_duplicate: false,
    });
  });

  it("住所と電話番号は省略できる", () => {
    expect(customerInputSchema.parse({ name: "A株式会社" })).toEqual({
      name: "A株式会社",
      address: null,
      phone: null,
      confirm_duplicate: false,
    });
  });

  it.each(["03-1234-5678", "0312345678", "090-1234-5678"])("電話番号 %s は通る", (phone) => {
    expect(customerInputSchema.safeParse({ name: "A", phone }).success).toBe(true);
  });

  it.each(["03(1234)5678", "03 1234 5678", "+81-3-1234-5678", "０３"])(
    "電話番号 %s は数字とハイフン以外を含むためエラー",
    (phone) => {
      const result = customerInputSchema.safeParse({ name: "A", phone });
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        "電話番号は数字とハイフンで入力してください",
      ]);
    },
  );
});
