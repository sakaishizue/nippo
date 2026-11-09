import { describe, expect, it } from "vitest";
import { dealInputSchema, dealListQuerySchema } from "./deals";

const input = {
  customer_id: 1,
  name: " 新サービス導入 ",
  owner_id: 2,
  stage: "proposal",
};

describe("dealInputSchema", () => {
  it("商談名の前後の空白を除き、省略した見込金額と受注予定日は null にする", () => {
    expect(dealInputSchema.parse(input)).toEqual({
      customer_id: 1,
      name: "新サービス導入",
      owner_id: 2,
      stage: "proposal",
      amount: null,
      expected_close_date: null,
    });
  });

  it("見込金額は0以上、2,147,483,647以下の整数", () => {
    const amountOk = (amount: unknown) => dealInputSchema.safeParse({ ...input, amount }).success;
    expect(amountOk(0)).toBe(true);
    expect(amountOk(2_147_483_647)).toBe(true);
    expect(amountOk(-1)).toBe(false);
    expect(amountOk(2_147_483_648)).toBe(false);
    expect(amountOk(1.5)).toBe(false);
    expect(amountOk("100")).toBe(false);
  });

  it("顧客と担当者が未選択ならメッセージを返す", () => {
    const result = dealInputSchema.safeParse({ ...input, customer_id: null, owner_id: undefined });
    expect(result.error?.issues.map((issue) => [issue.path.join("."), issue.message])).toEqual([
      ["customer_id", "顧客を選択してください"],
      ["owner_id", "担当者を選択してください"],
    ]);
  });
});

describe("dealListQuerySchema", () => {
  it("ステージは1つでも複数でも配列にする", () => {
    expect(dealListQuerySchema.parse({ stage: "won" }).stage).toEqual(["won"]);
    expect(dealListQuerySchema.parse({ stage: ["lead", "lost"] }).stage).toEqual(["lead", "lost"]);
    expect(dealListQuerySchema.parse({}).stage).toBeUndefined();
  });

  it("顧客と担当者のIDを数値にする", () => {
    expect(dealListQuerySchema.parse({ customer_id: "8", owner_id: "12" })).toMatchObject({
      customer_id: 8,
      owner_id: 12,
    });
  });
});
