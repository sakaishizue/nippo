import { describe, expect, test } from "vitest";
import {
  familyNameOf,
  monthDayOf,
  type NotificationEvent,
  type NotifiedReport,
  notificationMessage,
  notificationRecipients,
} from "./notifications";

// 山田さん(U1、id 12)の日報。上長は鈴木さん(M1、id 3)
const report = (overrides: Partial<NotifiedReport> = {}): NotifiedReport => ({
  id: 100,
  reportDate: "2026-11-06",
  status: "submitted",
  author: { id: 12, name: "山田 太郎", managerId: 3 },
  ...overrides,
});
const AUTHOR = 12;
const MANAGER = 3;
const manager = { id: MANAGER, name: "鈴木 一郎" };
const author = { id: AUTHOR, name: "山田 太郎" };

describe("notificationRecipients", () => {
  test("F-51: 提出は上長に通知する", () => {
    expect(notificationRecipients({ type: "submitted", report: report() })).toEqual([MANAGER]);
  });

  test("上長がいない作成者の提出は、誰にも通知しない", () => {
    const event: NotificationEvent = {
      type: "submitted",
      report: report({ author: { id: AUTHOR, name: "山田 太郎", managerId: null } }),
    };
    expect(notificationRecipients(event)).toEqual([]);
  });

  test.each(["approved", "returned"] as const)("F-52: %s は作成者に通知する", (type) => {
    expect(notificationRecipients({ type, report: report() })).toEqual([AUTHOR]);
  });

  test("F-53 / CMT-01: 作成者のコメントは上長に通知し、作成者には通知しない", () => {
    expect(
      notificationRecipients({ type: "commented", report: report(), commenter: author }),
    ).toEqual([MANAGER]);
  });

  test("F-53 / CMT-02: 上長のコメントは作成者に通知し、上長には通知しない", () => {
    expect(
      notificationRecipients({ type: "commented", report: report(), commenter: manager }),
    ).toEqual([AUTHOR]);
  });

  test("CMT-03: 下書きへのコメントは上長に通知しない", () => {
    const draft = report({ status: "draft" });
    expect(notificationRecipients({ type: "commented", report: draft, commenter: author })).toEqual(
      [],
    );
  });

  test.each(["submitted", "returned", "approved"] as const)(
    "%s の日報へのコメントは、投稿者以外の作成者と上長に通知する",
    (status) => {
      const other = { id: 99, name: "管理 太郎" };
      expect(
        notificationRecipients({ type: "commented", report: report({ status }), commenter: other }),
      ).toEqual([AUTHOR, MANAGER]);
    },
  );

  test("F-54: リマインドは本人に通知する", () => {
    expect(
      notificationRecipients({
        type: "reminder",
        userId: AUTHOR,
        reportDate: "2026-11-06",
        reportId: null,
      }),
    ).toEqual([AUTHOR]);
  });
});

describe("notificationMessage", () => {
  // 画面定義書 SCR-14 の通知文の例
  test.each([
    [{ type: "submitted", report: report() }, "山田さんが11月6日の日報を提出しました"],
    [{ type: "approved", report: report() }, "11月6日の日報が承認されました"],
    [{ type: "returned", report: report() }, "11月6日の日報が差し戻されました"],
    [
      { type: "commented", report: report(), commenter: { id: 13, name: "佐藤 花子" } },
      "11月6日の日報に佐藤さんがコメントしました",
    ],
    [
      { type: "reminder", userId: AUTHOR, reportDate: "2026-11-06", reportId: null },
      "11月6日の日報が未提出です",
    ],
  ] satisfies [NotificationEvent, string][])("%o は「%s」", (event, message) => {
    expect(notificationMessage(event)).toBe(message);
  });
});

describe("familyNameOf", () => {
  test.each([
    ["山田 太郎", "山田"],
    ["山田　太郎", "山田"],
    [" 山田  太郎 ", "山田"],
    ["山田太郎", "山田太郎"],
  ])("%s の姓は %s", (name, family) => {
    expect(familyNameOf(name)).toBe(family);
  });
});

describe("monthDayOf", () => {
  test.each([
    ["2026-11-06", "11月6日"],
    ["2027-01-15", "1月15日"],
  ])("%s は %s", (date, text) => {
    expect(monthDayOf(date)).toBe(text);
  });
});
