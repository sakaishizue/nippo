import type { ReportStatus } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { reportPermissions, visibleReportsWhere } from "./access";

const AUTHOR = { id: 12, role: "member" } as const;
const OTHER_MEMBER = { id: 13, role: "member" } as const;
const MANAGER = { id: 3, role: "manager" } as const;
const OTHER_MANAGER = { id: 4, role: "manager" } as const;
const ADMIN = { id: 1, role: "admin" } as const;

const report = (status: ReportStatus) => ({ userId: AUTHOR.id, status, managerId: MANAGER.id });

describe("visibleReportsWhere", () => {
  test("一般は自分の日報、上長は直属の部下の下書き以外、管理者は全員の下書き以外", () => {
    expect(visibleReportsWhere(AUTHOR)).toEqual({ userId: 12 });
    expect(visibleReportsWhere(MANAGER)).toEqual({
      user: { managerId: 3 },
      status: { not: "draft" },
    });
    expect(visibleReportsWhere(ADMIN)).toEqual({ status: { not: "draft" } });
  });
});

describe("reportPermissions", () => {
  test.each([
    // [ステータス, 作成者の権限, 直属の上長の権限]
    [
      "draft",
      { can_edit: true, can_review: false, can_comment: true },
      { can_edit: false, can_review: false, can_comment: false },
    ],
    [
      "submitted",
      { can_edit: false, can_review: false, can_comment: true },
      { can_edit: false, can_review: true, can_comment: true },
    ],
    [
      "returned",
      { can_edit: true, can_review: false, can_comment: true },
      { can_edit: false, can_review: false, can_comment: true },
    ],
    [
      "approved",
      { can_edit: false, can_review: false, can_comment: true },
      { can_edit: false, can_review: false, can_comment: true },
    ],
  ] as const)("%s: 作成者と直属の上長の権限", (status, forAuthor, forManager) => {
    expect(reportPermissions(AUTHOR, report(status))).toEqual(forAuthor);
    expect(reportPermissions(MANAGER, report(status))).toEqual(forManager);
  });

  test.each(["draft", "submitted", "returned", "approved"] as const)(
    "%s: 管理者、他の一般、他の上長は何もできない",
    (status) => {
      const none = { can_edit: false, can_review: false, can_comment: false };
      expect(reportPermissions(ADMIN, report(status))).toEqual(none);
      expect(reportPermissions(OTHER_MEMBER, report(status))).toEqual(none);
      expect(reportPermissions(OTHER_MANAGER, report(status))).toEqual(none);
    },
  );
});
