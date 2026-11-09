import { afterEach, describe, expect, test } from "vitest";
import { setNow } from "./clock";
import { createNotifications, type NotifiedReport } from "./notifications";
import { seedTestData } from "./testing/fixtures";
import { testDb } from "./testing/test-db";

const seed = async () => {
  const data = await seedTestData(testDb);
  const { U1, M1 } = data.users;
  const toReport = (
    id: number,
    status: NotifiedReport["status"],
    reportDate: string,
  ): NotifiedReport => ({
    id,
    reportDate,
    status,
    author: { id: U1.id, name: U1.name, managerId: M1.id },
  });
  return { ...data, sub: toReport(data.reports["R-sub"].id, "submitted", "2026-11-04") };
};

describe("createNotifications", () => {
  afterEach(() => setNow(null));

  test("通知先ごとに、種類、通知文、日報、作成日時を入れて通知を作る", async () => {
    const { sub, users } = await seed();
    setNow(new Date("2026-11-04T18:30:00+09:00"));

    const count = await createNotifications(testDb, {
      type: "commented",
      report: sub,
      commenter: { id: users.A1.id, name: users.A1.name },
    });

    expect(count).toBe(2);
    const created = await testDb.notification.findMany({ orderBy: { userId: "asc" } });
    expect(created.map((n) => [n.userId, n.type, n.reportId, n.message, n.readAt])).toEqual(
      [users.M1.id, users.U1.id]
        .sort((a, b) => a - b)
        .map((userId) => [
          userId,
          "commented",
          sub.id,
          "11月4日の日報に管理さんがコメントしました",
          null,
        ]),
    );
    expect(created.every((n) => n.createdAt.toISOString() === "2026-11-04T09:30:00.000Z")).toBe(
      true,
    );
  });

  test("通知先がいなければ、何も作らない", async () => {
    const { sub, users } = await seed();
    const count = await createNotifications(testDb, {
      type: "commented",
      report: { ...sub, status: "draft" },
      commenter: { id: users.U1.id, name: users.U1.name },
    });
    expect(count).toBe(0);
    expect(await testDb.notification.count()).toBe(0);
  });

  test("リマインドは、日報がなくても作れる(日報のIDは null)", async () => {
    const { users } = await seed();
    await createNotifications(testDb, {
      type: "reminder",
      userId: users.U2.id,
      reportDate: "2026-11-06",
      reportId: null,
    });
    expect(await testDb.notification.findMany()).toMatchObject([
      {
        userId: users.U2.id,
        type: "reminder",
        reportId: null,
        message: "11月6日の日報が未提出です",
      },
    ]);
  });

  test("日報の状態の変更と同じトランザクションで作れ、変更が失敗すると通知も作られない", async () => {
    const { sub } = await seed();

    // 成功: 承認と通知が両方残る
    await testDb.$transaction(async (tx) => {
      await tx.dailyReport.update({ where: { id: sub.id }, data: { status: "approved" } });
      await createNotifications(tx, { type: "approved", report: sub });
    });
    expect(await testDb.notification.count({ where: { type: "approved" } })).toBe(1);

    // 失敗: 通知を作った後にエラーになると、通知も元に戻る
    await expect(
      testDb.$transaction(async (tx) => {
        await createNotifications(tx, { type: "returned", report: sub });
        throw new Error("状態の変更に失敗");
      }),
    ).rejects.toThrow("状態の変更に失敗");
    expect(await testDb.notification.count({ where: { type: "returned" } })).toBe(0);
  });
});
