import { describe, expect, test } from "vitest";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";
import { businessDaysBetween, countPerfData, deletePerfData, insertPerfData } from "./perf-data";

// 性能テストのデータ(テスト仕様書 NFR-04、05、13)を、少ない量で入れて消す

const small = {
  passwordHash: "dummy-hash",
  lastDate: "2026-11-13",
  years: 1,
  managers: 2,
  membersPerManager: 2,
  customers: 10,
  deals: 20,
};

// 数千件を入れて消すため、既定の5秒より長く待つ
describe("性能テストのデータ", { timeout: 60_000 }, () => {
  test("営業日ごとに日報を作り、作業、訪問、承認履歴、通知がそろう", async () => {
    const summary = await insertPerfData(testDb, small);
    expect(summary).toMatchObject({ users: 7, customers: 10, deals: 20 });
    const days = businessDaysBetween("2025-11-14", "2026-11-13");
    // 1人あたり、営業日の約98%に日報がある
    expect(summary.reports).toBeGreaterThan(4 * days.length * 0.9);
    expect(summary.reports).toBeLessThanOrEqual(4 * days.length);

    // 日報は営業日だけで、1人1日1件
    const reports = await testDb.dailyReport.findMany({
      include: { workEntries: { include: { visit: true } }, reviews: true, user: true },
    });
    expect(reports).toHaveLength(summary.reports);
    const daySet = new Set(days);
    for (const report of reports) {
      expect(daySet.has(report.reportDate.toISOString().slice(0, 10))).toBe(true);
      expect(report.user.role).toBe("member");
      // 訪問の作業には訪問の詳細があり、それ以外にはない
      for (const entry of report.workEntries) {
        expect(entry.visit !== null).toBe(entry.category === "visit");
      }
      const total = report.workEntries.reduce((sum, entry) => sum + entry.minutes, 0);
      expect(total).toBeLessThanOrEqual(1440);
      if (report.status === "approved") {
        expect(report.reviews.at(-1)?.action).toBe("approved");
      }
    }
    // 商談を紐づけた訪問は、商談の顧客と訪問先の顧客が一致する
    const visits = await testDb.visit.findMany({
      where: { workEntry: { dealId: { not: null } } },
      include: { workEntry: { include: { deal: true } } },
    });
    expect(visits.length).toBeGreaterThan(0);
    for (const visit of visits) expect(visit.workEntry.deal?.customerId).toBe(visit.customerId);

    // 承認待ち(提出済み)と、未読の通知が最近の日報にある
    expect(reports.some((r) => r.status === "submitted")).toBe(true);
    expect(await testDb.notification.count({ where: { readAt: null } })).toBeGreaterThan(0);
    expect(await testDb.notification.count()).toBe(summary.notifications);

    await expect(insertPerfData(testDb, small)).rejects.toThrow("既にあります");
  });

  test("削除すると、性能テストのデータだけが消え、他のデータは残る", async () => {
    const seed = await seedTestData(testDb);
    const before = {
      users: await testDb.user.count(),
      reports: await testDb.dailyReport.count(),
      customers: await testDb.customer.count(),
      deals: await testDb.deal.count(),
      notifications: await testDb.notification.count(),
    };
    await insertPerfData(testDb, small);
    await testDb.notification.create({
      data: { userId: seed.users.U1.id, type: "approved", message: "残る通知" },
    });

    await deletePerfData(testDb);

    expect(await countPerfData(testDb)).toEqual({ users: 0, customers: 0, reports: 0 });
    expect({
      users: await testDb.user.count(),
      reports: await testDb.dailyReport.count(),
      customers: await testDb.customer.count(),
      deals: await testDb.deal.count(),
      notifications: await testDb.notification.count(),
    }).toEqual({ ...before, notifications: before.notifications + 1 });
    expect(await testDb.workEntry.count({ where: { report: { userId: seed.users.U1.id } } })).toBe(
      5,
    );
  });
});
