import { paginatedSchema, reportListItemSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの日報: U1 は 11月2日(承認済み)、3日(差し戻し、C2 への訪問)、4日(提出済み)、5日(下書き)。U3 は 11月4日(提出済み)
const listSchema = paginatedSchema(reportListItemSchema);

type Role = keyof TestData["users"];

const setup = async () => {
  const data = await seedTestData(testDb);
  const search = async (role: Role, query = "") => {
    const client = await loginAs(createTestApp(), data.users[role]);
    const res = await client.request(`/api/v1/reports${query ? `?${query}` : ""}`);
    expect(res.status).toBe(200);
    return listSchema.parse(await res.json());
  };
  /** 一覧を「担当者の記号:日付:ステータス」にして比べやすくする */
  const names = new Map(Object.entries(data.users).map(([key, user]) => [user.id, key]));
  const summary = (list: Awaited<ReturnType<typeof search>>) =>
    list.items.map((r) => `${names.get(r.user.id)}:${r.report_date}:${r.status}`);
  return { ...data, search, summary };
};

describe("GET /reports の閲覧範囲", () => {
  test("VIEW-01: 一般(U1)は自分の日報だけ。下書きを含む", async () => {
    const { search, summary } = await setup();
    expect(summary(await search("U1"))).toEqual([
      "U1:2026-11-05:draft",
      "U1:2026-11-04:submitted",
      "U1:2026-11-03:returned",
      "U1:2026-11-02:approved",
    ]);
  });

  test("VIEW-02: 一般が user_id に U2 を指定しても無視して、自分の日報を返す", async () => {
    const { search, summary, users } = await setup();
    expect(summary(await search("U1", `user_id=${users.U2.id}`))).toHaveLength(4);
    expect(summary(await search("U2", `user_id=${users.U1.id}`))).toEqual([]);
  });

  test("VIEW-03: 上長(M1)は U1、U2 の日報だけ。下書きと R-u3 を含まない", async () => {
    const { search, summary } = await setup();
    expect(summary(await search("M1"))).toEqual([
      "U1:2026-11-04:submitted",
      "U1:2026-11-03:returned",
      "U1:2026-11-02:approved",
    ]);
  });

  test("VIEW-04: 管理者(A1)は全員の日報。下書きを含まない", async () => {
    const { search, summary } = await setup();
    expect(summary(await search("A1")).sort()).toEqual(
      [
        "U1:2026-11-04:submitted",
        "U1:2026-11-03:returned",
        "U1:2026-11-02:approved",
        "U3:2026-11-04:submitted",
      ].sort(),
    );
  });

  test("上長と管理者は、担当者で絞り込める", async () => {
    const { search, summary, users } = await setup();
    expect(summary(await search("A1", `user_id=${users.U3.id}`))).toEqual([
      "U3:2026-11-04:submitted",
    ]);
    // 部下以外を指定しても、閲覧範囲の外は返さない
    expect(summary(await search("M1", `user_id=${users.U3.id}`))).toEqual([]);
  });
});

describe("GET /reports の検索条件", () => {
  test("VIEW-08: 訪問内容にだけ含まれる語で検索すると、その日報がヒットする", async () => {
    const { search, summary } = await setup();
    // 「新サービス」は R-app の訪問内容にだけある
    expect(summary(await search("U1", `q=${encodeURIComponent("新サービス")}`))).toEqual([
      "U1:2026-11-02:approved",
    ]);
  });

  test("キーワードは所感、翌日の予定、次回アクションも対象", async () => {
    const { search, summary } = await setup();
    const hit = async (q: string) => summary(await search("U1", `q=${encodeURIComponent(q)}`));
    expect(await hit("担当者が交代")).toEqual(["U1:2026-11-03:returned"]); // 所感
    expect(await hit("見積書の作成")).toEqual(["U1:2026-11-04:submitted"]); // 翌日の予定
    expect(await hit("来週までに")).toEqual(["U1:2026-11-02:approved"]); // 次回アクション
  });

  test("VIEW-09: 顧客に C2 を指定すると、C2 への訪問を含む日報だけ", async () => {
    const { search, summary, customers } = await setup();
    expect(summary(await search("U1", `customer_id=${customers.C2.id}`))).toEqual([
      "U1:2026-11-03:returned",
    ]);
    expect(summary(await search("A1", `customer_id=${customers.C2.id}`)).sort()).toEqual(
      ["U1:2026-11-03:returned", "U3:2026-11-04:submitted"].sort(),
    );
  });

  test("VIEW-10: ステータスを submitted と returned で指定すると、その2つだけ", async () => {
    const { search, summary } = await setup();
    expect(summary(await search("U1", "status=submitted&status=returned"))).toEqual([
      "U1:2026-11-04:submitted",
      "U1:2026-11-03:returned",
    ]);
    expect(summary(await search("U1", "status=draft"))).toEqual(["U1:2026-11-05:draft"]);
  });

  test("期間(from、to)で絞り込む。境界の日を含む", async () => {
    const { search, summary } = await setup();
    expect(summary(await search("U1", "from=2026-11-03&to=2026-11-04"))).toEqual([
      "U1:2026-11-04:submitted",
      "U1:2026-11-03:returned",
    ]);
    expect(summary(await search("U1", "from=2026-11-05"))).toEqual(["U1:2026-11-05:draft"]);
  });

  test("クエリの値が不正なら 422", async () => {
    const { users } = await setup();
    const client = await loginAs(createTestApp(), users.U1);
    expect((await client.request("/api/v1/reports?status=unknown")).status).toBe(422);
    expect((await client.request("/api/v1/reports?from=2026/11/01")).status).toBe(422);
  });
});

describe("GET /reports の項目と並び順", () => {
  test("訪問件数、合計時間、コメント数を返す", async () => {
    const { search, reports, users } = await setup();
    await testDb.reportComment.createMany({
      data: [
        { reportId: reports["R-app"].id, userId: users.M1.id, body: "よくできています" },
        { reportId: reports["R-app"].id, userId: users.U1.id, body: "ありがとうございます" },
      ],
    });
    const list = await search("U1", "status=approved");
    expect(list.items).toEqual([
      {
        id: reports["R-app"].id,
        report_date: "2026-11-02",
        user: { id: users.U1.id, name: "山田 太郎" },
        status: "approved",
        visit_count: 1,
        total_minutes: 150,
        comment_count: 2,
      },
    ]);
  });

  test("VIEW-11: 21件以上あるとき、日付の新しい順に1ページ20件で返し、total は全件数", async () => {
    const { search, users } = await setup();
    // 10月1日〜21日の承認済みの日報を足す(U1 は全部で25件)
    await testDb.dailyReport.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        userId: users.U1.id,
        reportDate: new Date(Date.UTC(2026, 9, i + 1)),
        status: "approved" as const,
      })),
    });
    const page1 = await search("U1");
    expect(page1.pagination).toEqual({ page: 1, per_page: 20, total: 25 });
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]?.report_date).toBe("2026-11-05");
    const dates = page1.items.map((r) => r.report_date);
    expect([...dates].sort().reverse()).toEqual(dates);

    const page2 = await search("U1", "page=2");
    expect(page2.items.map((r) => r.report_date)).toEqual([
      "2026-10-05",
      "2026-10-04",
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
    ]);
  });

  test("ログインしていなければ 401", async () => {
    await setup();
    expect((await createTestApp().request("/api/v1/reports")).status).toBe(401);
  });
});
