import type { DealDetailResponse } from "@nippo/shared";
import { describe, expect, it } from "vitest";
import { type DealFormInput, dealFormDefaults, dealFormSchema, toDealRequest } from "./deal-form";

const input = (overrides: Partial<DealFormInput> = {}): DealFormInput => ({
  customer: { id: 8, name: "A株式会社" },
  name: "新サービス導入",
  owner_id: "12",
  stage: "proposal",
  amount: "",
  expected_close_date: "",
  ...overrides,
});

const issuesOf = (values: DealFormInput) => {
  const result = dealFormSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join("."), i.message]);
};

describe("dealFormSchema", () => {
  it("顧客、商談名、担当者が未入力ならエラー", () => {
    expect(issuesOf(input({ customer: null, name: " ", owner_id: "" }))).toEqual([
      ["customer", "顧客を選択してください"],
      ["name", "商談名を入力してください"],
      ["owner_id", "担当者を選択してください"],
    ]);
  });

  it.each([
    ["", true],
    ["0", true],
    ["3,000,000", true],
    ["2147483647", true],
    ["2147483648", false],
    ["-1", false],
    ["1.5", false],
    ["abc", false],
  ])("見込金額 %s は %s", (amount, ok) => {
    expect(issuesOf(input({ amount })).length === 0).toBe(ok);
  });
});

describe("toDealRequest", () => {
  it("空の見込金額と受注予定日は null、カンマは除いて数値にする", () => {
    expect(toDealRequest(dealFormSchema.parse(input({ amount: "3,000,000" })))).toEqual({
      customer_id: 8,
      name: "新サービス導入",
      owner_id: 12,
      stage: "proposal",
      amount: 3_000_000,
      expected_close_date: null,
    });
    expect(
      toDealRequest(dealFormSchema.parse(input({ expected_close_date: "2026-12-20" }))),
    ).toMatchObject({
      amount: null,
      expected_close_date: "2026-12-20",
    });
  });
});

describe("dealFormDefaults", () => {
  const deal: DealDetailResponse = {
    id: 31,
    name: "新サービス導入",
    customer: { id: 8, name: "A株式会社" },
    owner: { id: 12, name: "山田 太郎" },
    stage: "proposal",
    amount: 3_000_000,
    expected_close_date: "2026-12-20",
    has_visits: true,
  };

  it("登録は、指定した顧客と担当者を選んでおき、ステージは見込み", () => {
    expect(
      dealFormDefaults(undefined, { customer: { id: 8, name: "A株式会社" }, ownerId: 12 }),
    ).toEqual(input({ stage: "lead", name: "" }));
  });

  it("編集は今の値", () => {
    expect(dealFormDefaults(deal)).toEqual(
      input({ amount: "3000000", expected_close_date: "2026-12-20" }),
    );
  });
});
