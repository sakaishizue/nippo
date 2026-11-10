import { describe, expect, it } from "vitest";
import { reportInputSchema, reportSubmitIssues } from "./reports";

const pathsOf = (input: unknown) => {
  const result = reportInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("reportInputSchema", () => {
  it("作業は省略でき、空の所感、翌日の予定、メモは null にする", () => {
    expect(
      reportInputSchema.parse({ report_date: "2026-11-09", reflection: " ", next_plan: "" }),
    ).toEqual({
      report_date: "2026-11-09",
      reflection: null,
      next_plan: null,
      work_entries: [],
    });
    const parsed = reportInputSchema.parse({
      report_date: "2026-11-09",
      work_entries: [{ category: "travel", minutes: 30, note: "" }],
    });
    expect(parsed.work_entries).toEqual([
      { category: "travel", minutes: 30, deal_id: null, note: null, visit: null },
    ]);
  });

  it("訪問の行は visit が必須、訪問以外の行は visit を付けられない", () => {
    expect(
      pathsOf({ report_date: "2026-11-09", work_entries: [{ category: "visit", minutes: 30 }] }),
    ).toEqual(["work_entries.0.visit"]);
    expect(
      pathsOf({
        report_date: "2026-11-09",
        work_entries: [{ category: "meeting", minutes: 30, visit: { customer_id: 1 } }],
      }),
    ).toEqual(["work_entries.0.visit"]);
  });

  it("時間は1以上の整数で、全行の合計は1,440分以下", () => {
    const entries = (...minutes: number[]) => ({
      report_date: "2026-11-09",
      work_entries: minutes.map((m) => ({ category: "other", minutes: m })),
    });
    expect(pathsOf(entries(1440))).toEqual([]);
    expect(pathsOf(entries(720, 721))).toEqual(["work_entries"]);
    expect(pathsOf(entries(0))).toEqual(["work_entries.0.minutes"]);
    expect(pathsOf(entries(1.5))).toEqual(["work_entries.0.minutes"]);
  });

  it("訪問内容は下書きでは空でもよい", () => {
    expect(
      pathsOf({
        report_date: "2026-11-09",
        work_entries: [{ category: "visit", minutes: 30, visit: { customer_id: 1, content: "" } }],
      }),
    ).toEqual([]);
  });
});

describe("reportSubmitIssues", () => {
  const complete = {
    reflection: "所感",
    next_plan: "予定",
    work_entries: [
      { category: "visit", visit: { content: "訪問内容" } },
      { category: "travel", visit: null },
    ],
  };

  it("入力がそろっていれば、違反はない", () => {
    expect(reportSubmitIssues(complete)).toEqual([]);
  });

  it("作業なし、訪問内容なし、所感なし、翌日の予定なしをまとめて返す", () => {
    expect(
      reportSubmitIssues({
        reflection: " ",
        next_plan: null,
        work_entries: [],
      }).map((issue) => issue.field),
    ).toEqual(["work_entries", "reflection", "next_plan"]);
    expect(
      reportSubmitIssues({
        ...complete,
        work_entries: [{ category: "visit", visit: { content: "" } }],
      }),
    ).toEqual([{ field: "work_entries[0].visit.content", message: "訪問内容を入力してください" }]);
  });
});
