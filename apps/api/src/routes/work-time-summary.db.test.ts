import { workTimeSummarySchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの U1 の日報
// - R-app(承認済み、11月2日): 訪問90分(C1、D1)、移動60分
// - R-ret(差し戻し、11月3日): 訪問60分(C2、商談なし)
// - R-sub(提出済み、11月4日): 訪問90分(C1、D1)
// - R-draft(下書き、11月5日): 訪問60分(C1)
// U3 の R-u3(提出済み、11月4日): 訪問60分(C2)
const PERIOD = "from=2026-11-01&to=2026-11-30";

type Role = keyof TestData["users"];

const setup = async (role: Role = "U1") => {
  const data = await seedTestData(testDb);
  const client = await loginAs(createTestApp(), data.users[role]);
  const get = (query: string) => client.request(`/api/v1/work-time-summary?${query}`);
  const summary = async (query: string) => {
    const res = await get(query);
    expect(res.status).toBe(200);
    return workTimeSummarySchema.parse(await res.json());
  };
  /** U2 の提出済みの日報(11月6日、社内会議30分)を足す */
  const addU2Report = () =>
    testDb.dailyReport.create({
      data: {
        userId: data.users.U2.id,
        reportDate: new Date("2026-11-06T00:00:00Z"),
        status: "submitted",
        workEntries: { create: [{ category: "meeting", minutes: 30 }] },
      },
    });
  return { ...data, get, summary, addU2Report };
};

const rows = (body: { items: { key: { name: string } | null; minutes: number }[] }) =>
  body.items.map((item) => [item.key?.name ?? null, item.minutes]);

describe("GET /work-time-summary の集計", () => {
  test("SUM-01、SUM-06: 一般は自分の提出済みと承認済みの日報だけを集計する。下書きと差し戻しは含まない", async () => {
    const { summary } = await setup();
    const body = await summary(`${PERIOD}&group_by=category`);
    // R-app(150分)と R-sub(90分)だけ
    expect(body.total_minutes).toBe(240);
  });

  test("SUM-02: 作業区分別は、区分ごとの合計と割合。割合の合計は1", async () => {
    const { summary } = await setup();
    const body = await summary(`${PERIOD}&group_by=category`);
    expect(body).toEqual({
      group_by: "category",
      total_minutes: 240,
      items: [
        { key: { id: "visit", name: "訪問" }, minutes: 180, ratio: 0.75 },
        { key: { id: "travel", name: "移動" }, minutes: 60, ratio: 0.25 },
      ],
    });
    expect(body.items.reduce((sum, item) => sum + item.ratio, 0)).toBeCloseTo(1);
  });

  test("SUM-03: 顧客別は、訪問以外の時間を未分類(key: null)にして最後に並べる", async () => {
    const { summary, customers } = await setup();
    const body = await summary(`${PERIOD}&group_by=customer`);
    expect(body.items).toEqual([
      { key: { id: customers.C1.id, name: "A株式会社" }, minutes: 180, ratio: 0.75 },
      { key: null, minutes: 60, ratio: 0.25 },
    ]);
  });

  test("未分類の時間が多くても、未分類は最後に並べる", async () => {
    const { summary, users } = await setup();
    await testDb.dailyReport.create({
      data: {
        userId: users.U1.id,
        reportDate: new Date("2026-11-06T00:00:00Z"),
        status: "approved",
        workEntries: { create: [{ category: "document", minutes: 600 }] },
      },
    });
    const body = await summary(`${PERIOD}&group_by=customer`);
    expect(rows(body)).toEqual([
      ["A株式会社", 180],
      [null, 660],
    ]);
  });

  test("SUM-04: 商談別は、商談なしの作業を未分類にする", async () => {
    const { summary, deals } = await setup();
    const body = await summary(`${PERIOD}&group_by=deal`);
    expect(body.items).toEqual([
      { key: { id: deals.D1.id, name: "新サービス導入" }, minutes: 180, ratio: 0.75 },
      { key: null, minutes: 60, ratio: 0.25 },
    ]);
  });

  test("期間の外の日報は集計しない。期間の境界の日は含む", async () => {
    const { summary } = await setup();
    expect((await summary("from=2026-11-04&to=2026-11-04&group_by=category")).total_minutes).toBe(
      90,
    );
    expect((await summary("from=2026-11-05&to=2026-11-30&group_by=category")).items).toEqual([]);
  });
});

describe("GET /work-time-summary の範囲", () => {
  test("SUM-05: 一般が担当者別を指定すると 422", async () => {
    const { get } = await setup();
    const res = await get(`${PERIOD}&group_by=user`);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.map((d) => d.field)).toEqual(["group_by"]);
  });

  test("SUM-07: 上長が user_id を省略すると、部下(U1、U2)の合計。U3 は含まない", async () => {
    const { summary, addU2Report, users } = await setup("M1");
    await addU2Report();
    const body = await summary(`${PERIOD}&group_by=user`);
    expect(body.items).toEqual([
      { key: { id: users.U1.id, name: "山田 太郎" }, minutes: 240, ratio: 240 / 270 },
      { key: { id: users.U2.id, name: "佐藤 花子" }, minutes: 30, ratio: 30 / 270 },
    ]);
  });

  test("上長は user_id で部下を絞り込める。複数指定もできる", async () => {
    const { summary, addU2Report, users } = await setup("M1");
    await addU2Report();
    expect(rows(await summary(`${PERIOD}&group_by=user&user_id=${users.U2.id}`))).toEqual([
      ["佐藤 花子", 30],
    ]);
    expect(
      (await summary(`${PERIOD}&group_by=user&user_id=${users.U1.id}&user_id=${users.U2.id}`))
        .total_minutes,
    ).toBe(270);
  });

  test("SUM-08: 上長が部下以外(U3)を指定すると 422", async () => {
    const { get, users } = await setup("M1");
    const res = await get(`${PERIOD}&group_by=user&user_id=${users.U3.id}`);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { field: string }[] } };
    expect(body.error.details.map((d) => d.field)).toEqual(["user_id"]);
  });

  test("M2 は自分の部下(U3)だけを集計する", async () => {
    const { summary } = await setup("M2");
    expect(rows(await summary(`${PERIOD}&group_by=user`))).toEqual([["田中 三郎", 60]]);
  });

  test("SUM-10: 管理者は 403", async () => {
    const { get } = await setup("A1");
    expect((await get(`${PERIOD}&group_by=category`)).status).toBe(403);
  });

  test("ログインしていなければ 401", async () => {
    await setup();
    expect(
      (await createTestApp().request(`/api/v1/work-time-summary?${PERIOD}&group_by=category`))
        .status,
    ).toBe(401);
  });
});

describe("GET /work-time-summary の入力チェック", () => {
  test("SUM-09: 期間は1年まで 200、1年と1日は 422", async () => {
    const { get } = await setup();
    expect((await get("from=2026-01-01&to=2026-12-31&group_by=category")).status).toBe(200);
    const res = await get("from=2026-01-01&to=2027-01-01&group_by=category");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { details: { field: string; message: string }[] } };
    expect(body.error.details).toEqual([{ field: "to", message: "期間は1年以内にしてください" }]);
  });

  test.each([
    ["期間がない", "group_by=category"],
    ["切り口がない", PERIOD],
    ["切り口が不正", `${PERIOD}&group_by=week`],
    ["終了が開始より前", "from=2026-11-30&to=2026-11-01&group_by=category"],
  ])("%s場合は 422", async (_name, query) => {
    const { get } = await setup();
    expect((await get(query)).status).toBe(422);
  });
});
