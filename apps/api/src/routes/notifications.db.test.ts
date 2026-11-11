import { meSchema, notificationSchema, paginatedSchema } from "@nippo/shared";
import { afterEach, describe, expect, test } from "vitest";
import { setNow } from "../clock";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

afterEach(() => setNow(null));

type Role = keyof TestData["users"];
const listSchema = paginatedSchema(notificationSchema);

/** シードのデータに、U1 宛ての通知3件(未読2件)と U2 宛ての通知1件を足す */
const setup = async (role: Role = "U1") => {
  const data = await seedTestData(testDb);
  const { U1, U2 } = data.users;
  const make = (userId: number, message: string, createdAt: string, readAt: string | null = null) =>
    testDb.notification.create({
      data: {
        userId,
        reportId: data.reports["R-app"].id,
        type: "approved",
        message,
        createdAt: new Date(createdAt),
        readAt: readAt ? new Date(readAt) : null,
      },
    });
  const oldest = await make(
    U1.id,
    "1件目",
    "2026-11-02T19:00:00+09:00",
    "2026-11-03T09:00:00+09:00",
  );
  const middle = await make(U1.id, "2件目", "2026-11-03T19:00:00+09:00");
  const newest = await make(U1.id, "3件目", "2026-11-04T19:00:00+09:00");
  const others = await make(U2.id, "U2宛て", "2026-11-04T20:00:00+09:00");
  const client = await loginAs(createTestApp(), data.users[role]);
  const post = (path: string) => client.request(`/api/v1/notifications${path}`, { method: "POST" });
  const unreadCount = async () =>
    meSchema.parse(await (await client.request("/api/v1/me")).json()).unread_notification_count;
  return { ...data, client, post, unreadCount, notifications: { oldest, middle, newest, others } };
};

describe("GET /notifications", () => {
  test("NTF-01: U1 宛ての通知だけを新しい順に返す", async () => {
    const { client, notifications, reports } = await setup();
    const res = await client.request("/api/v1/notifications");
    expect(res.status).toBe(200);
    const body = listSchema.parse(await res.json());
    expect(body.pagination).toEqual({ page: 1, per_page: 20, total: 3 });
    expect(body.items.map((n) => n.message)).toEqual(["3件目", "2件目", "1件目"]);
    expect(body.items[2]).toEqual({
      id: notifications.oldest.id,
      type: "approved",
      message: "1件目",
      report_id: reports["R-app"].id,
      target_date: null,
      read_at: "2026-11-03T09:00:00+09:00",
      created_at: "2026-11-02T19:00:00+09:00",
    });
  });

  test("ページ送りできる", async () => {
    const { client } = await setup();
    const body = listSchema.parse(
      await (await client.request("/api/v1/notifications?page=2&per_page=2")).json(),
    );
    expect(body.items.map((n) => n.message)).toEqual(["1件目"]);
    expect(body.pagination).toEqual({ page: 2, per_page: 2, total: 3 });
  });
});

describe("POST /notifications/{id}/read", () => {
  test("NTF-02: 未読の通知を既読にすると 204。read_at が入り、未読数が1減る", async () => {
    const { post, unreadCount, notifications } = await setup();
    setNow(new Date("2026-11-05T09:00:00+09:00"));
    expect(await unreadCount()).toBe(2);
    expect((await post(`/${notifications.newest.id}/read`)).status).toBe(204);
    const row = await testDb.notification.findUniqueOrThrow({
      where: { id: notifications.newest.id },
    });
    expect(row.readAt?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    expect(await unreadCount()).toBe(1);
  });

  test("NTF-03: 既読の通知を既読にしても 204。既読日時は変えない", async () => {
    const { post, notifications } = await setup();
    expect((await post(`/${notifications.oldest.id}/read`)).status).toBe(204);
    const row = await testDb.notification.findUniqueOrThrow({
      where: { id: notifications.oldest.id },
    });
    expect(row.readAt?.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  test("NTF-04: U1 が U2 の通知を既読にすると 404。既読にならない", async () => {
    const { post, notifications } = await setup();
    expect((await post(`/${notifications.others.id}/read`)).status).toBe(404);
    const row = await testDb.notification.findUniqueOrThrow({
      where: { id: notifications.others.id },
    });
    expect(row.readAt).toBeNull();
  });

  test("存在しない通知は 404", async () => {
    const { post } = await setup();
    expect((await post("/999999/read")).status).toBe(404);
  });
});

describe("POST /notifications/read-all", () => {
  test("NTF-05: 自分宛ての未読をすべて既読にすると 204。未読数が0になり、他人の通知は変えない", async () => {
    const { post, unreadCount, notifications } = await setup();
    expect((await post("/read-all")).status).toBe(204);
    expect(await unreadCount()).toBe(0);
    const others = await testDb.notification.findUniqueOrThrow({
      where: { id: notifications.others.id },
    });
    expect(others.readAt).toBeNull();
  });
});

describe("通知APIの権限", () => {
  test("NTF-06: 管理者(A1)は 403", async () => {
    const { client, post, notifications } = await setup("A1");
    expect((await client.request("/api/v1/notifications")).status).toBe(403);
    expect((await post(`/${notifications.newest.id}/read`)).status).toBe(403);
    expect((await post("/read-all")).status).toBe(403);
  });

  test("上長も使える", async () => {
    const { client } = await setup("M1");
    expect((await client.request("/api/v1/notifications")).status).toBe(200);
  });

  test("ログインしていなければ 401", async () => {
    await setup();
    expect((await createTestApp().request("/api/v1/notifications")).status).toBe(401);
  });
});
