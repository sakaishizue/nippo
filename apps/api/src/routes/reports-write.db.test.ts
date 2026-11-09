import { reportDetailSchema } from "@nippo/shared";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// 今日は 2026年11月9日(月)。シードの日報は 11月2日(承認済み)、3日(差し戻し)、4日(提出済み)、5日(下書き)
const TODAY = "2026-11-09";

beforeEach(() => setNow(new Date(`${TODAY}T10:00:00+09:00`)));
afterEach(() => setNow(null));

type Role = keyof TestData["users"];

const setup = async (role: Role = "U1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  const { C1, C2 } = data.customers;
  const { D1 } = data.deals;
  /** 訪問(C1、D1)と移動の2行 */
  const body = (overrides: Record<string, unknown> = {}) => ({
    report_date: TODAY,
    reflection: "提案資料の反応がよかった",
    next_plan: "B社へ見積を送付",
    work_entries: [
      {
        category: "visit",
        minutes: 90,
        deal_id: D1.id,
        note: null,
        visit: {
          customer_id: C1.id,
          contact_name: "田中部長",
          content: "新サービスの提案",
          next_action: "来週までに見積を提示",
        },
      },
      { category: "travel", minutes: 60, deal_id: null, note: null, visit: null },
    ],
    ...overrides,
  });
  const visitTo = (customerId: number, dealId: number | null = null) => ({
    category: "visit",
    minutes: 60,
    deal_id: dealId,
    visit: { customer_id: customerId, content: "訪問" },
  });
  const put = (report: keyof TestData["reports"], payload: unknown) =>
    client.json("PUT", `/api/v1/reports/${data.reports[report].id}`, payload);
  return { ...data, client, body, visitTo, put, C1, C2, D1 };
};

const errorOf = async (res: Response) =>
  (await res.json()).error as {
    code: string;
    existing_report_id?: number;
    details?: { field: string; message: string }[];
  };
const fieldsOf = async (res: Response) => (await errorOf(res)).details?.map((d) => d.field);

describe("POST /reports", () => {
  test("RPT-01: 今日の日付で、訪問1件と移動1件の下書きを作れる", async () => {
    const { client, body, users } = await setup();
    const res = await client.json("POST", "/api/v1/reports", body());
    expect(res.status).toBe(201);
    const report = reportDetailSchema.parse(await res.json());
    expect(report).toMatchObject({
      report_date: TODAY,
      user: { id: users.U1.id },
      status: "draft",
      submitted_at: null,
      total_minutes: 150,
      reflection: "提案資料の反応がよかった",
      permissions: { can_edit: true },
    });
    expect(
      report.work_entries.map((e) => [e.category, e.minutes, e.visit?.contact_name ?? null]),
    ).toEqual([
      ["visit", 90, "田中部長"],
      ["travel", 60, null],
    ]);
  });

  test("RPT-02: 作業なしの下書きを作れる", async () => {
    const { client } = await setup();
    const res = await client.json("POST", "/api/v1/reports", {
      report_date: TODAY,
      work_entries: [],
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      total_minutes: 0,
      work_entries: [],
      reflection: null,
    });
  });

  test("RPT-03: 明日の日付は 422", async () => {
    const { client, body } = await setup();
    const res = await client.json("POST", "/api/v1/reports", body({ report_date: "2026-11-10" }));
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["report_date"]);
  });

  test("RPT-04: 日報がある日付は 409 REPORT_ALREADY_EXISTS と既存の日報のID", async () => {
    const { client, body, reports } = await setup();
    const res = await client.json("POST", "/api/v1/reports", body({ report_date: "2026-11-04" }));
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
      existing_report_id: reports["R-sub"].id,
    });
  });

  test("RPT-05: 時間が0なら 422 で、field は該当の行を指す", async () => {
    const { client, body } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({ work_entries: [{ category: "travel", minutes: 0, visit: null }] }),
    );
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["work_entries[0].minutes"]);
  });

  test.each([
    ["RPT-06: 合計1,440分は作れる", [1000, 440], 201],
    ["RPT-07: 合計1,441分は 422", [1000, 441], 422],
  ])("%s", async (_name, minutes, status) => {
    const { client, body } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({ work_entries: minutes.map((m) => ({ category: "document", minutes: m })) }),
    );
    expect(res.status).toBe(status);
    if (status === 422) expect(await fieldsOf(res)).toEqual(["work_entries"]);
  });

  test("RPT-08: 訪問の行で visit が null は 422", async () => {
    const { client, body } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({ work_entries: [{ category: "visit", minutes: 60, visit: null }] }),
    );
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["work_entries[0].visit"]);
  });

  test("RPT-09: 移動の行に visit があれば 422", async () => {
    const { client, body, C1 } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({ work_entries: [{ category: "travel", minutes: 60, visit: { customer_id: C1.id } }] }),
    );
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["work_entries[0].visit"]);
  });

  test("RPT-10: 訪問先が C2 で商談が D1(C1 の商談)なら 422", async () => {
    const { client, body, visitTo, C2, D1 } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({ work_entries: [visitTo(C2.id, D1.id)] }),
    );
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatchObject({
      details: [
        { field: "work_entries[0].deal_id", message: "訪問先の顧客の商談を選んでください" },
      ],
    });
  });

  test("存在しない商談と顧客は 422", async () => {
    const { client, body, visitTo } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({
        work_entries: [visitTo(999999), { category: "meeting", minutes: 30, deal_id: 999999 }],
      }),
    );
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual([
      "work_entries[0].visit.customer_id",
      "work_entries[1].deal_id",
    ]);
  });

  test("訪問以外の作業にも商談を紐づけられる(F-32)", async () => {
    const { client, body, D1 } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({
        work_entries: [{ category: "document", minutes: 120, deal_id: D1.id, note: "見積書" }],
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      work_entries: [{ deal: { id: D1.id }, note: "見積書", visit: null }],
    });
  });

  test.each([
    ["RPT-11: 所感が2,000文字", { reflection: "あ".repeat(2000) }, 201, null],
    ["RPT-11: 所感が2,001文字", { reflection: "あ".repeat(2001) }, 422, "reflection"],
    ["翌日の予定が2,001文字", { next_plan: "あ".repeat(2001) }, 422, "next_plan"],
    [
      "メモが501文字",
      { work_entries: [{ category: "other", minutes: 10, note: "あ".repeat(501) }] },
      422,
      "work_entries[0].note",
    ],
  ])("%s", async (_name, overrides, status, field) => {
    const { client, body } = await setup();
    const res = await client.json("POST", "/api/v1/reports", body(overrides));
    expect(res.status).toBe(status);
    if (field) expect(await fieldsOf(res)).toEqual([field]);
  });

  test("面談相手が101文字は 422", async () => {
    const { client, body, C1 } = await setup();
    const res = await client.json(
      "POST",
      "/api/v1/reports",
      body({
        work_entries: [
          {
            category: "visit",
            minutes: 30,
            visit: { customer_id: C1.id, contact_name: "あ".repeat(101) },
          },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(await fieldsOf(res)).toEqual(["work_entries[0].visit.contact_name"]);
  });

  test.each([
    ["RPT-12: 上長(M1)", "M1"],
    ["RPT-13: 管理者(A1)", "A1"],
  ] as const)("%s は作れない(403)", async (_name, role) => {
    const { client, body } = await setup(role);
    const res = await client.json("POST", "/api/v1/reports", body());
    expect(res.status).toBe(403);
  });
});

describe("PUT /reports/{id}", () => {
  test("RPT-14: 作業を1件だけ送ると、送らなかった作業とその訪問の詳細が削除される", async () => {
    const { put, body, reports, visitTo, C1 } = await setup();
    const date = { report_date: "2026-11-05" };
    // まず訪問2件にしておく
    await put("R-draft", body({ ...date, work_entries: [visitTo(C1.id), visitTo(C1.id)] }));
    expect(
      await testDb.visit.count({ where: { workEntry: { reportId: reports["R-draft"].id } } }),
    ).toBe(2);

    const res = await put(
      "R-draft",
      body({ ...date, work_entries: [{ category: "travel", minutes: 30 }] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      total_minutes: 30,
      work_entries: [{ category: "travel" }],
    });
    expect(await testDb.workEntry.count({ where: { reportId: reports["R-draft"].id } })).toBe(1);
    expect(
      await testDb.visit.count({ where: { workEntry: { reportId: reports["R-draft"].id } } }),
    ).toBe(0);
  });

  test("RPT-15: 下書きの日付を、日報のない過去日に変更できる", async () => {
    const { put, body } = await setup();
    const res = await put("R-draft", body({ report_date: "2026-11-06" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ report_date: "2026-11-06", status: "draft" });
  });

  test("RPT-16: 下書きの日付を、R-app の日付に変更すると 409", async () => {
    const { put, body, reports } = await setup();
    const res = await put("R-draft", body({ report_date: "2026-11-02" }));
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({
      code: "REPORT_ALREADY_EXISTS",
      existing_report_id: reports["R-app"].id,
    });
  });

  test("下書きの日付を未来に変更すると 422", async () => {
    const { put, body } = await setup();
    const res = await put("R-draft", body({ report_date: "2026-11-10" }));
    expect(res.status).toBe(422);
  });

  test("RPT-17: 差し戻し中の日付の変更は 422", async () => {
    const { put, body } = await setup();
    const res = await put("R-ret", body({ report_date: "2026-11-06" }));
    expect(res.status).toBe(422);
    expect(await errorOf(res)).toMatchObject({
      details: [{ field: "report_date", message: "差し戻し中は日付を変更できません" }],
    });
  });

  test("RPT-18: 差し戻し中の内容を変更でき、ステータスは returned のまま", async () => {
    const { put, body } = await setup();
    const res = await put(
      "R-ret",
      body({ report_date: "2026-11-03", reflection: "具体的に書き直した" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "returned",
      reflection: "具体的に書き直した",
    });
  });

  test.each([
    ["RPT-19: 提出済み(R-sub)", "R-sub", "2026-11-04"],
    ["RPT-20: 承認済み(R-app)", "R-app", "2026-11-02"],
  ] as const)("%s の更新は 409 INVALID_STATUS", async (_name, report, date) => {
    const { put, body } = await setup();
    const res = await put(report, body({ report_date: date }));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("INVALID_STATUS");
  });

  test("RPT-21: 他の一般(U2)が R-draft を更新すると 404", async () => {
    const { reports, body, users } = await setup();
    const u2 = await loginAs(createTestApp(), users.U2);
    const res = await u2.json(
      "PUT",
      `/api/v1/reports/${reports["R-draft"].id}`,
      body({ report_date: "2026-11-05" }),
    );
    expect(res.status).toBe(404);
  });

  test("上長(M1)は更新できない(403)", async () => {
    const { reports, body, users } = await setup();
    const m1 = await loginAs(createTestApp(), users.M1);
    const res = await m1.json(
      "PUT",
      `/api/v1/reports/${reports["R-sub"].id}`,
      body({ report_date: "2026-11-04" }),
    );
    expect(res.status).toBe(403);
  });

  test("入力の誤りでは、作業を消さない", async () => {
    const { put, body, reports, visitTo, C2, D1 } = await setup();
    const res = await put(
      "R-draft",
      body({ report_date: "2026-11-05", work_entries: [visitTo(C2.id, D1.id)] }),
    );
    expect(res.status).toBe(422);
    expect(await testDb.workEntry.count({ where: { reportId: reports["R-draft"].id } })).toBe(1);
  });
});
