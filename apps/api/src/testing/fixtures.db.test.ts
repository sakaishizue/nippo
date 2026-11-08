import { describe, expect, test } from "vitest";
import { seedTestData } from "./fixtures";
import { testDb } from "./test-db";

describe("テスト仕様書 3章のテストデータ", () => {
  test("ユーザーと上長の関係", async () => {
    const { users } = await seedTestData(testDb);
    expect(users.U1.managerId).toBe(users.M1.id);
    expect(users.U2.managerId).toBe(users.M1.id);
    expect(users.U3.managerId).toBe(users.M2.id);
    expect(users.X1).toMatchObject({ managerId: users.M1.id, isActive: false });
    for (const u of [users.A1, users.M1, users.M2]) expect(u.managerId).toBeNull();

    const subordinates = await testDb.user.findMany({
      where: { managerId: users.M1.id, isActive: true },
      orderBy: { id: "asc" },
    });
    expect(subordinates.map((u) => u.email)).toEqual(["u1@example.com", "u2@example.com"]);
  });

  test("日報のステータスと内容", async () => {
    const { users, customers, deals, reports } = await seedTestData(testDb);
    expect(
      Object.fromEntries(Object.entries(reports).map(([key, r]) => [key, [r.userId, r.status]])),
    ).toEqual({
      "R-draft": [users.U1.id, "draft"],
      "R-sub": [users.U1.id, "submitted"],
      "R-ret": [users.U1.id, "returned"],
      "R-app": [users.U1.id, "approved"],
      "R-u3": [users.U3.id, "submitted"],
    });

    const sub = await testDb.dailyReport.findUniqueOrThrow({
      where: { id: reports["R-sub"].id },
      include: { workEntries: { include: { visit: true } } },
    });
    expect(sub.workEntries).toHaveLength(1);
    expect(sub.workEntries[0]).toMatchObject({
      category: "visit",
      dealId: deals.D1.id,
      visit: { customerId: customers.C1.id },
    });

    const app = await testDb.dailyReport.findUniqueOrThrow({
      where: { id: reports["R-app"].id },
      include: { workEntries: true, reviews: true },
    });
    expect(app.workEntries.map((w) => w.category)).toEqual(["visit", "travel"]);
    expect(app.reviews).toMatchObject([{ action: "approved", reviewerId: users.M1.id }]);

    const ret = await testDb.reportReview.findFirstOrThrow({
      where: { reportId: reports["R-ret"].id },
    });
    expect(ret).toMatchObject({ action: "returned", reason: "訪問内容をもう少し具体的に" });
  });
});

describe("スキーマの制約", () => {
  test("同じユーザーの同じ日付の日報は作れない", async () => {
    const { users } = await seedTestData(testDb);
    await expect(
      testDb.dailyReport.create({
        data: { userId: users.U1.id, reportDate: new Date("2026-11-05T00:00:00Z") },
      }),
    ).rejects.toThrow();
  });

  test("作業を削除すると、訪問の詳細も削除される", async () => {
    const { reports } = await seedTestData(testDb);
    await testDb.workEntry.deleteMany({ where: { reportId: reports["R-draft"].id } });
    const visits = await testDb.visit.count({
      where: { workEntry: { reportId: reports["R-draft"].id } },
    });
    expect(visits).toBe(0);
    // 日報5件にそれぞれ訪問が1件ずつあり、R-draft の分だけが消える
    expect(await testDb.visit.count()).toBe(4);
  });

  test("部下がいる上長と、作業に使われている商談は削除できない", async () => {
    const { users, deals } = await seedTestData(testDb);
    await expect(testDb.user.delete({ where: { id: users.M2.id } })).rejects.toThrow();
    await expect(testDb.deal.delete({ where: { id: deals.D1.id } })).rejects.toThrow();
  });
});

// 前のテストで作ったデータが残っていないこと(実行順に左右されないこと)を確認する
describe("テストごとのデータの初期化", () => {
  test.each(["1回目", "2回目"])("%s: 開始時はデータが空で、ID は1から振られる", async () => {
    expect(await testDb.user.count()).toBe(0);
    const customer = await testDb.customer.create({ data: { name: "C社" } });
    expect(customer.id).toBe(1);
  });
});
