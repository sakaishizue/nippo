import { describe, expect, test } from "vitest";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";
import { runReminders } from "./reminder";

// 未提出のリマインド(F-54)。実行日の前営業日の日報が対象(月曜日は金曜日)
// シードの一般: U1、U2(上長 M1)、U3(上長 M2)、X1(無効)。U1 の日報は 11月2日〜5日
type Member = "U1" | "U2" | "U3";

/** 日本時間の date の朝9時(Cloud Scheduler が起動する時刻) */
const nineAm = (date: string) => new Date(`${date}T09:00:00+09:00`);

const setup = async () => {
  const data = await seedTestData(testDb);
  const addReport = (
    user: keyof TestData["users"],
    date: string,
    status: "draft" | "submitted" | "returned" | "approved",
  ) =>
    testDb.dailyReport.create({
      data: { userId: data.users[user].id, reportDate: new Date(`${date}T00:00:00Z`), status },
    });
  const names = new Map(Object.entries(data.users).map(([key, user]) => [user.id, key]));
  /** 作られたリマインドを「記号:対象日」にする */
  const reminders = async () =>
    (
      await testDb.notification.findMany({
        where: { type: "reminder" },
        orderBy: [{ userId: "asc" }, { targetDate: "asc" }],
      })
    ).map((n) => `${names.get(n.userId)}:${n.targetDate?.toISOString().slice(0, 10)}`);
  return { ...data, addReport, reminders };
};

/** 前営業日(11月9日 月曜日)に、指定した人以外の日報を提出済みにしておく */
const submitAllExcept = async (
  addReport: Awaited<ReturnType<typeof setup>>["addReport"],
  date: string,
  except: Member[],
) => {
  for (const member of ["U1", "U2", "U3"] as const) {
    if (!except.includes(member)) await addReport(member, date, "submitted");
  }
};

describe("runReminders", () => {
  test("RMD-01: 前営業日の日報がない人に、reminder の通知を作る", async () => {
    const { addReport, reminders, users } = await setup();
    await submitAllExcept(addReport, "2026-11-09", ["U2"]);
    // 11月10日(火)の朝9時。前営業日は11月9日(月)
    const result = await runReminders(testDb, nineAm("2026-11-10"));
    expect(result).toEqual({ today: "2026-11-10", targetDate: "2026-11-09", created: 1 });
    expect(await reminders()).toEqual(["U2:2026-11-09"]);
    const [notification] = await testDb.notification.findMany({ where: { type: "reminder" } });
    expect(notification).toMatchObject({
      userId: users.U2.id,
      reportId: null,
      message: "11月9日の日報が未提出です",
      readAt: null,
    });
  });

  test("RMD-02: 前営業日の日報が下書きのままなら通知する。通知は日報に紐づける", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-09", ["U1"]);
    const draft = await addReport("U1", "2026-11-09", "draft");
    await runReminders(testDb, nineAm("2026-11-10"));
    expect(await reminders()).toEqual(["U1:2026-11-09"]);
    const [notification] = await testDb.notification.findMany({ where: { type: "reminder" } });
    expect(notification?.reportId).toBe(draft.id);
  });

  test("差し戻し中の日報も、再提出するまでは未提出として通知する", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-09", ["U3"]);
    await addReport("U3", "2026-11-09", "returned");
    await runReminders(testDb, nineAm("2026-11-10"));
    expect(await reminders()).toEqual(["U3:2026-11-09"]);
  });

  test("RMD-03: 前営業日の日報が提出済み、承認済みなら通知しない", async () => {
    const { addReport, reminders } = await setup();
    await addReport("U1", "2026-11-09", "submitted");
    await addReport("U2", "2026-11-09", "approved");
    await addReport("U3", "2026-11-09", "submitted");
    const result = await runReminders(testDb, nineAm("2026-11-10"));
    expect(result).toMatchObject({ created: 0 });
    expect(await reminders()).toEqual([]);
  });

  test("RMD-04: 実行日が土曜日、日曜日なら何もしない", async () => {
    const { reminders } = await setup();
    expect(await runReminders(testDb, nineAm("2026-11-07"))).toEqual({
      skipped: "holiday",
      today: "2026-11-07",
    });
    expect(await runReminders(testDb, nineAm("2026-11-08"))).toMatchObject({ skipped: "holiday" });
    expect(await reminders()).toEqual([]);
  });

  test("RMD-04: 月曜日は金曜日の日報が対象。土曜日と日曜日の日報は対象にしない", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-06", ["U1"]);
    const result = await runReminders(testDb, nineAm("2026-11-09"));
    expect(result).toMatchObject({ targetDate: "2026-11-06", created: 1 });
    expect(await reminders()).toEqual(["U1:2026-11-06"]);
  });

  test("RMD-05: 実行日が祝日(11月23日 勤労感謝の日)なら何もしない", async () => {
    const { reminders } = await setup();
    expect(await runReminders(testDb, nineAm("2026-11-23"))).toMatchObject({ skipped: "holiday" });
    expect(await reminders()).toEqual([]);
  });

  test("RMD-05: 祝日の翌日(11月24日)は、祝日を飛ばして金曜日(11月20日)が対象", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-20", ["U2"]);
    expect(await runReminders(testDb, nineAm("2026-11-24"))).toMatchObject({
      targetDate: "2026-11-20",
    });
    expect(await reminders()).toEqual(["U2:2026-11-20"]);
  });

  test("RMD-06: 上長、管理者、無効なユーザーには通知しない", async () => {
    const { reminders, users } = await setup();
    // 誰も日報を出していない日。一般の U1、U2、U3 だけが対象
    await runReminders(testDb, nineAm("2026-11-10"));
    expect(await reminders()).toEqual(["U1:2026-11-09", "U2:2026-11-09", "U3:2026-11-09"]);
    const recipients = (await testDb.notification.findMany()).map((n) => n.userId);
    for (const user of [users.A1, users.M1, users.M2, users.X1]) {
      expect(recipients).not.toContain(user.id);
    }
  });

  test("RMD-07: 同じ日に2回実行しても、通知は1件だけ", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-09", ["U1"]);
    expect(await runReminders(testDb, nineAm("2026-11-10"))).toMatchObject({ created: 1 });
    expect(await runReminders(testDb, new Date("2026-11-10T09:30:00+09:00"))).toMatchObject({
      created: 0,
    });
    expect(await reminders()).toEqual(["U1:2026-11-09"]);
  });

  test("同時に実行しても、通知は1件だけ", async () => {
    const { addReport, reminders } = await setup();
    await submitAllExcept(addReport, "2026-11-09", ["U1"]);
    await Promise.all([
      runReminders(testDb, nineAm("2026-11-10")),
      runReminders(testDb, nineAm("2026-11-10")),
    ]);
    expect(await reminders()).toEqual(["U1:2026-11-09"]);
  });

  test("日付が変わると、次の前営業日の分を新しく通知する", async () => {
    const { reminders } = await setup();
    await runReminders(testDb, nineAm("2026-11-10"));
    await runReminders(testDb, nineAm("2026-11-11"));
    expect(await reminders()).toEqual([
      "U1:2026-11-09",
      "U1:2026-11-10",
      "U2:2026-11-09",
      "U2:2026-11-10",
      "U3:2026-11-09",
      "U3:2026-11-10",
    ]);
  });
});
