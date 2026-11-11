import type { ReportDetail } from "@nippo/shared";
import { describe, expect, it } from "vitest";
import {
  latestReturnReason,
  newWorkEntry,
  parseMinutes,
  type ReportFormValues,
  reportFormDefaults,
  reportFormErrors,
  reportSubmitErrors,
  toReportFormField,
  toReportRequest,
  totalMinutesOf,
  type WorkEntryFormValues,
} from "./report-form";

const TODAY = "2026-11-10";
const C1 = { id: 8, name: "A株式会社" };

const visitEntry = (overrides: Partial<WorkEntryFormValues> = {}): WorkEntryFormValues => ({
  ...newWorkEntry(),
  category: "visit",
  minutes: "90",
  visit: { customer: C1, contact_name: "田中部長", content: "新サービスの提案", next_action: "" },
  ...overrides,
});

const values = (overrides: Partial<ReportFormValues> = {}): ReportFormValues => ({
  report_date: TODAY,
  reflection: "反応がよかった",
  next_plan: "見積を送る",
  work_entries: [visitEntry()],
  ...overrides,
});

const errorsOf = (input: ReportFormValues) =>
  reportFormErrors(input, TODAY).map(({ name, message }) => [name, message]);

describe("parseMinutes と totalMinutesOf", () => {
  it.each([
    ["90", 90],
    [" 30 ", 30],
    ["１２０", 120],
  ])("%s は %d 分", (input, minutes) => {
    expect(parseMinutes(input)).toBe(minutes);
  });

  it.each(["", "1.5", "-1", "abc"])("%s は数値にならない", (input) => {
    expect(parseMinutes(input)).toBeNaN();
  });

  it("合計は、数値になっていない行を除いて足す", () => {
    expect(totalMinutesOf([{ minutes: "90" }, { minutes: "" }, { minutes: "60" }])).toBe(150);
  });
});

describe("toReportRequest", () => {
  it("訪問の行にだけ訪問の詳細を付け、商談はIDにする", () => {
    const request = toReportRequest(
      values({
        work_entries: [
          visitEntry({ deal: { id: 31, name: "新サービス導入", customer: C1 } }),
          // 訪問から切り替えた行は、残っている訪問の入力を送らない
          visitEntry({ category: "travel", minutes: "60" }),
        ],
      }),
    );
    expect(request.work_entries).toEqual([
      {
        category: "visit",
        minutes: 90,
        deal_id: 31,
        note: "",
        visit: {
          customer_id: 8,
          contact_name: "田中部長",
          content: "新サービスの提案",
          next_action: "",
        },
      },
      { category: "travel", minutes: 60, deal_id: null, note: "", visit: null },
    ]);
  });
});

describe("reportFormErrors(保存の入力チェック)", () => {
  it("入力がそろっていればエラーなし", () => {
    expect(errorsOf(values())).toEqual([]);
  });

  it("下書きは、作業なし、所感と翌日の予定なしでも保存できる", () => {
    expect(errorsOf(values({ work_entries: [], reflection: "", next_plan: "" }))).toEqual([]);
  });

  it("日付が空、または未来の日付はエラー", () => {
    expect(errorsOf(values({ report_date: "" }))).toEqual([
      ["report_date", "日付を入力してください"],
    ]);
    expect(errorsOf(values({ report_date: "2026-11-11" }))).toEqual([
      ["report_date", "未来の日付は選べません"],
    ]);
  });

  it("時間が1未満や整数でない行は、その行の時間のエラー", () => {
    const input = values({
      work_entries: [visitEntry(), visitEntry({ minutes: "0" }), visitEntry({ minutes: "" })],
    });
    expect(errorsOf(input)).toEqual([
      ["work_entries.1.minutes", "1以上の整数を入力してください"],
      ["work_entries.2.minutes", "1以上の整数を入力してください"],
    ]);
  });

  it("合計が1,440分を超えると、作業全体のエラー", () => {
    const input = values({
      work_entries: [visitEntry({ minutes: "1000" }), visitEntry({ minutes: "441" })],
    });
    expect(errorsOf(input)).toEqual([
      ["work_entries.root", "1日の作業時間の合計は1,440分以下にしてください"],
    ]);
    expect(
      errorsOf(
        values({ work_entries: [visitEntry({ minutes: "1000" }), visitEntry({ minutes: "440" })] }),
      ),
    ).toEqual([]);
  });

  it("訪問の行で顧客を選んでいなければ、顧客の欄のエラー", () => {
    const entry = visitEntry();
    const input = values({
      work_entries: [{ ...entry, visit: { ...entry.visit, customer: null } }],
    });
    expect(errorsOf(input)).toEqual([["work_entries.0.visit.customer", "顧客を選択してください"]]);
  });

  it("訪問以外の行は、顧客を選んでいなくてもよい", () => {
    const input = values({
      work_entries: [{ ...newWorkEntry(), category: "document", minutes: "30" }],
    });
    expect(errorsOf(input)).toEqual([]);
  });
});

describe("reportSubmitErrors(提出時のチェック)", () => {
  it("作業なし、所感なし、翌日の予定なしをエラーにする", () => {
    const input = values({ work_entries: [], reflection: " ", next_plan: "" });
    expect(reportSubmitErrors(input).map(({ name }) => name)).toEqual([
      "work_entries.root",
      "reflection",
      "next_plan",
    ]);
  });

  it("訪問の行の訪問内容が空ならエラー。訪問以外の行は見ない", () => {
    const entry = visitEntry();
    const input = values({
      work_entries: [
        { ...entry, visit: { ...entry.visit, content: "" } },
        { ...entry, category: "travel", visit: { ...entry.visit, content: "" } },
      ],
    });
    expect(reportSubmitErrors(input)).toEqual([
      { name: "work_entries.0.visit.content", message: "訪問内容を入力してください" },
    ]);
  });
});

describe("toReportFormField", () => {
  it.each([
    ["report_date", "report_date"],
    ["work_entries", "work_entries.root"],
    ["work_entries[0].minutes", "work_entries.0.minutes"],
    ["work_entries[1].deal_id", "work_entries.1.deal"],
    ["work_entries[2].visit.customer_id", "work_entries.2.visit.customer"],
    ["work_entries[2].visit.content", "work_entries.2.visit.content"],
  ])("%s を %s にする", (field, name) => {
    expect(toReportFormField(field)).toBe(name);
  });
});

const detail = (overrides: Partial<ReportDetail> = {}): ReportDetail => ({
  id: 100,
  report_date: "2026-11-06",
  user: { id: 12, name: "山田 太郎" },
  status: "returned",
  reflection: null,
  next_plan: "見積を送る",
  submitted_at: "2026-11-06T18:30:00+09:00",
  total_minutes: 150,
  work_entries: [
    {
      id: 501,
      category: "visit",
      minutes: 90,
      deal: { id: 31, name: "新サービス導入" },
      note: null,
      visit: {
        id: 201,
        customer: C1,
        contact_name: null,
        content: "新サービスの提案",
        next_action: null,
      },
    },
    { id: 502, category: "travel", minutes: 60, deal: null, note: "電車", visit: null },
  ],
  reviews: [],
  comments: [],
  permissions: { can_edit: true, can_review: false, can_comment: true },
  ...overrides,
});

describe("reportFormDefaults", () => {
  it("新規は今日の日付で、訪問の行を1つ出す", () => {
    expect(reportFormDefaults(undefined, TODAY)).toEqual({
      report_date: TODAY,
      reflection: "",
      next_plan: "",
      work_entries: [newWorkEntry()],
    });
  });

  it("編集は日報の内容を入れる。訪問の商談の顧客は訪問先にする", () => {
    const defaults = reportFormDefaults(detail(), TODAY);
    expect(defaults.report_date).toBe("2026-11-06");
    expect(defaults.reflection).toBe("");
    expect(defaults.work_entries).toEqual([
      {
        category: "visit",
        minutes: "90",
        deal: { id: 31, name: "新サービス導入", customer: C1 },
        note: "",
        visit: { customer: C1, contact_name: "", content: "新サービスの提案", next_action: "" },
      },
      {
        category: "travel",
        minutes: "60",
        deal: null,
        note: "電車",
        visit: { customer: null, contact_name: "", content: "", next_action: "" },
      },
    ]);
  });
});

describe("latestReturnReason", () => {
  it("最新の差し戻しの理由を返す", () => {
    const review = (id: number, action: "approved" | "returned", reason: string | null) => ({
      id,
      reviewer: { id: 3, name: "鈴木 一郎" },
      action,
      reason,
      created_at: "2026-11-06T20:00:00+09:00",
    });
    expect(
      latestReturnReason(
        detail({
          reviews: [review(1, "returned", "1回目"), review(2, "returned", "2回目")],
        }),
      ),
    ).toBe("2回目");
    expect(latestReturnReason(detail())).toBeNull();
  });
});
