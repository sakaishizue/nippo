import { managerDashboardSchema, memberDashboardSchema } from "@nippo/shared";
import { afterEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの日報: U1 は 11月2日(承認済み)、3日(差し戻し)、4日(提出済み)、5日(下書き)
afterEach(() => setNow(null));

type Role = keyof TestData["users"];

/** 日本時間の date の朝10時を「今」にして、データを入れる */
const setup = async (date: string) => {
  setNow(new Date(`${date}T10:00:00+09:00`));
  const data = await seedTestData(testDb);
  const dashboard = async (role: Role) => {
    const client = await loginAs(createTestApp(), data.users[role]);
    return client.request("/api/v1/dashboard");
  };
  const addReport = (
    user: keyof TestData["users"],
    date: string,
    status: "draft" | "submitted" | "approved",
  ) =>
    testDb.dailyReport.create({
      data: { userId: data.users[user].id, reportDate: new Date(`${date}T00:00:00Z`), status },
    });
  return { ...data, dashboard, addReport };
};

describe("GET /dashboard(一般)", () => {
  test("VIEW-14: 今日の日報が未作成なら today_report は null。returned_reports に R-ret と理由", async () => {
    const { dashboard, reports } = await setup("2026-11-09");
    const res = await dashboard("U1");
    expect(res.status).toBe(200);
    const body = memberDashboardSchema.parse(await res.json());
    expect(body.today_report).toBeNull();
    expect(body.returned_reports).toEqual([
      { id: reports["R-ret"].id, report_date: "2026-11-03", reason: "訪問内容をもう少し具体的に" },
    ]);
  });

  test("今日の日報があれば、そのステータスを返す", async () => {
    const { dashboard, reports } = await setup("2026-11-05");
    const body = memberDashboardSchema.parse(await (await dashboard("U1")).json());
    expect(body.today_report).toEqual({
      id: reports["R-draft"].id,
      report_date: "2026-11-05",
      status: "draft",
    });
  });

  test("直近7日分(今日を含む)の日報を、合計時間付きで新しい順に返す", async () => {
    const { dashboard } = await setup("2026-11-09");
    const body = memberDashboardSchema.parse(await (await dashboard("U1")).json());
    // 11月3日〜9日。11月2日(承認済み)は8日前のため含まない
    expect(body.recent_reports.map((r) => [r.report_date, r.status, r.total_minutes])).toEqual([
      ["2026-11-05", "draft", 60],
      ["2026-11-04", "submitted", 90],
      ["2026-11-03", "returned", 60],
    ]);
  });

  test("差し戻しが複数回あれば、最新の差し戻し理由を返す", async () => {
    const { dashboard, reports, users } = await setup("2026-11-09");
    await testDb.reportReview.create({
      data: {
        reportId: reports["R-ret"].id,
        reviewerId: users.M1.id,
        action: "returned",
        reason: "2回目の理由",
        createdAt: new Date("2026-11-04T19:00:00+09:00"),
      },
    });
    const body = memberDashboardSchema.parse(await (await dashboard("U1")).json());
    expect(body.returned_reports[0]?.reason).toBe("2回目の理由");
  });
});

describe("GET /dashboard(上長)", () => {
  test("承認待ちの件数と、有効な部下ごとの前営業日と今日の日報を返す", async () => {
    const { dashboard, addReport, users } = await setup("2026-11-05");
    // 前営業日(11月4日)は U1 が提出済み。今日(11月5日)は U1 が下書き、U2 が提出済み
    const u2Today = await addReport("U2", "2026-11-05", "submitted");
    const res = await dashboard("M1");
    expect(res.status).toBe(200);
    const body = managerDashboardSchema.parse(await res.json());
    // U1 の R-sub と U2 の今日の日報(X1 は無効のため部下に出さない)
    expect(body.pending_count).toBe(2);
    expect(body.subordinates).toEqual([
      {
        user: { id: users.U1.id, name: "山田 太郎" },
        previous_business_day: { report_id: expect.any(Number), status: "submitted" },
        // VIEW-15: 今日の日報が下書きなら null(未提出)
        today: null,
      },
      {
        user: { id: users.U2.id, name: "佐藤 花子" },
        previous_business_day: null,
        today: { report_id: u2Today.id, status: "submitted" },
      },
    ]);
  });

  test("月曜日の前営業日は金曜日", async () => {
    const { dashboard, addReport } = await setup("2026-11-09");
    const friday = await addReport("U1", "2026-11-06", "approved");
    // 土曜日の日報は見ない
    await addReport("U1", "2026-11-07", "submitted");
    const body = managerDashboardSchema.parse(await (await dashboard("M1")).json());
    expect(body.subordinates[0]?.previous_business_day).toEqual({
      report_id: friday.id,
      status: "approved",
    });
  });

  test("祝日の月曜日(11月23日 勤労感謝の日)の翌日は、前営業日が金曜日", async () => {
    const { dashboard, addReport } = await setup("2026-11-24");
    const friday = await addReport("U1", "2026-11-20", "submitted");
    const body = managerDashboardSchema.parse(await (await dashboard("M1")).json());
    expect(body.subordinates[0]?.previous_business_day).toEqual({
      report_id: friday.id,
      status: "submitted",
    });
  });

  test("別の上長の部下の日報は数えない", async () => {
    const { dashboard } = await setup("2026-11-05");
    // M2 の部下は U3。U3 の提出済み(11月4日)が承認待ち
    const body = managerDashboardSchema.parse(await (await dashboard("M2")).json());
    expect(body.pending_count).toBe(1);
    expect(body.subordinates.map((s) => s.user.name)).toEqual(["田中 三郎"]);
  });
});

describe("GET /dashboard の権限", () => {
  test("管理者は 403", async () => {
    const { dashboard } = await setup("2026-11-09");
    expect((await dashboard("A1")).status).toBe(403);
  });

  test("ログインしていなければ 401", async () => {
    await setup("2026-11-09");
    expect((await createTestApp().request("/api/v1/dashboard")).status).toBe(401);
  });
});
