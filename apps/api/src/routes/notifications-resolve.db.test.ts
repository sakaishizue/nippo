import { meSchema } from "@nippo/shared";
import { afterEach, beforeEach, expect, test } from "vitest";
import { setNow } from "../clock";
import { createNotifications } from "../notifications";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// 用件が片付いた通知を既読にする(要件定義書 4.6、#112)
// シードの日報: U1 の R-draft(下書き、11月5日)、R-sub(提出済み、11月4日)

beforeEach(() => setNow(new Date("2026-11-06T10:00:00+09:00")));
afterEach(() => setNow(null));

const setup = async () => {
  const data = await seedTestData(testDb);
  // R-draft に所感と翌日の予定を入れて、提出できる状態にする(訪問内容は入力済み)
  await testDb.dailyReport.update({
    where: { id: data.reports["R-draft"].id },
    data: { reflection: "見積書の反応を確認できた", nextPlan: "見積の修正" },
  });
  const app = createTestApp();
  const u1 = await loginAs(app, data.users.U1);
  const m1 = await loginAs(app, data.users.M1);
  const post = (client: typeof u1, path: string, body?: unknown) =>
    client.request(`/api/v1${path}`, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  const unreadCount = async (client: typeof u1) =>
    meSchema.parse(await (await client.request("/api/v1/me")).json()).unread_notification_count;
  /** 通知の種類と日報ごとの既読の状態 */
  const readStates = async (userId: number) =>
    (
      await testDb.notification.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        select: { type: true, reportId: true, readAt: true },
      })
    ).map((n) => ({ type: n.type, reportId: n.reportId, read: n.readAt !== null }));
  return { ...data, u1, m1, post, unreadCount, readStates };
};

test("NTF-07: 上長が提出の通知を見る前に承認すると、その通知は既読になり、未読数から外れる", async () => {
  const { u1, m1, post, unreadCount, readStates, reports, users } = await setup();
  const draft = reports["R-draft"].id;
  // 別の日報(R-sub)の提出の通知は、片付いていないため未読のまま
  await testDb.notification.create({
    data: {
      userId: users.M1.id,
      reportId: reports["R-sub"].id,
      type: "submitted",
      message: "R-sub",
    },
  });
  expect((await post(u1, `/reports/${draft}/submit`)).status).toBe(200);
  expect(await unreadCount(m1)).toBe(2);

  expect((await post(m1, `/reports/${draft}/approve`)).status).toBe(200);
  expect(await readStates(users.M1.id)).toEqual([
    { type: "submitted", reportId: reports["R-sub"].id, read: false },
    { type: "submitted", reportId: draft, read: true },
  ]);
  expect(await unreadCount(m1)).toBe(1);
  // 作成者への承認の通知は未読
  expect(await readStates(users.U1.id)).toEqual([
    { type: "approved", reportId: draft, read: false },
  ]);
});

test("NTF-08: 上長が提出の通知を見る前に差し戻すと、その通知は既読になる", async () => {
  const { u1, m1, post, unreadCount, readStates, reports, users } = await setup();
  const draft = reports["R-draft"].id;
  await post(u1, `/reports/${draft}/submit`);

  expect((await post(m1, `/reports/${draft}/return`, { reason: "具体的に" })).status).toBe(200);
  expect(await readStates(users.M1.id)).toEqual([
    { type: "submitted", reportId: draft, read: true },
  ]);
  expect(await unreadCount(m1)).toBe(0);
});

test("NTF-09: 差し戻しの通知を見る前に再提出すると、その通知は既読になる。コメントの通知は未読のまま", async () => {
  const { u1, m1, post, unreadCount, readStates, reports, users } = await setup();
  const draft = reports["R-draft"].id;
  await post(u1, `/reports/${draft}/submit`);
  await post(m1, `/reports/${draft}/return`, { reason: "具体的に" });
  await post(m1, `/reports/${draft}/comments`, { body: "訪問先の反応も書いてください" });
  expect(await unreadCount(u1)).toBe(2);

  expect((await post(u1, `/reports/${draft}/submit`)).status).toBe(200);
  expect(await readStates(users.U1.id)).toEqual([
    { type: "returned", reportId: draft, read: true },
    { type: "commented", reportId: draft, read: false },
  ]);
  expect(await unreadCount(u1)).toBe(1);
  // 再提出の通知は、上長に未読で届く
  expect(await readStates(users.M1.id)).toEqual([
    { type: "submitted", reportId: draft, read: true },
    { type: "submitted", reportId: draft, read: false },
  ]);
});

test("NTF-10: リマインドを見る前に対象日の日報を提出すると、そのリマインドは既読になる。他の日のリマインドは未読のまま", async () => {
  const { u1, post, unreadCount, readStates, reports, users } = await setup();
  // 日報を作る前に届いたリマインド(日報のIDは null)と、別の日のリマインド
  for (const reportDate of ["2026-11-05", "2026-11-02"]) {
    await createNotifications(testDb, {
      type: "reminder",
      userId: users.U1.id,
      reportDate,
      reportId: null,
    });
  }
  expect(await unreadCount(u1)).toBe(2);

  expect((await post(u1, `/reports/${reports["R-draft"].id}/submit`)).status).toBe(200);
  const reminders = await testDb.notification.findMany({
    where: { userId: users.U1.id, type: "reminder" },
    orderBy: { targetDate: "asc" },
    select: { targetDate: true, readAt: true },
  });
  expect(
    reminders.map((n) => [n.targetDate?.toISOString().slice(0, 10), n.readAt !== null]),
  ).toEqual([
    ["2026-11-02", false],
    ["2026-11-05", true],
  ]);
  expect(await unreadCount(u1)).toBe(1);
  expect(await readStates(users.U1.id)).toHaveLength(2);
});

test("既読の日時は、片付けたときの日時。既に既読の通知は変えない", async () => {
  const { u1, m1, post, reports, users } = await setup();
  const draft = reports["R-draft"].id;
  await post(u1, `/reports/${draft}/submit`);
  const readAt = new Date("2026-11-06T10:05:00+09:00");
  const old = await testDb.notification.create({
    data: {
      userId: users.M1.id,
      reportId: draft,
      type: "submitted",
      message: "既読",
      readAt,
    },
  });
  setNow(new Date("2026-11-06T11:00:00+09:00"));
  await post(m1, `/reports/${draft}/approve`);

  const rows = await testDb.notification.findMany({
    where: { userId: users.M1.id },
    orderBy: { id: "asc" },
    select: { id: true, readAt: true },
  });
  expect(rows.map((n) => [n.id === old.id, n.readAt?.toISOString()])).toEqual([
    [false, "2026-11-06T02:00:00.000Z"],
    [true, readAt.toISOString()],
  ]);
});
