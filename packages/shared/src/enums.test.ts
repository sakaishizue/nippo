import { describe, expect, test } from "vitest";
import {
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  dealStageSchema,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  notificationTypeSchema,
  REPORT_STATUS_LABELS,
  REPORT_STATUSES,
  REVIEW_ACTION_LABELS,
  REVIEW_ACTIONS,
  ROLE_LABELS,
  ROLES,
  reportStatusSchema,
  reviewActionSchema,
  roleSchema,
  WORK_CATEGORIES,
  WORK_CATEGORY_LABELS,
  workCategorySchema,
} from "./enums";

// 期待値は API仕様書 1.7 の表をそのまま書き写したもの
describe("API仕様書 1.7 の列挙値", () => {
  test.each([
    ["role", ROLES, ["member", "manager", "admin"]],
    ["status(日報)", REPORT_STATUSES, ["draft", "submitted", "returned", "approved"]],
    ["category(作業区分)", WORK_CATEGORIES, ["visit", "travel", "document", "meeting", "other"]],
    ["stage(商談)", DEAL_STAGES, ["lead", "proposal", "negotiation", "won", "lost"]],
    ["action(承認履歴)", REVIEW_ACTIONS, ["approved", "returned"]],
    [
      "type(通知)",
      NOTIFICATION_TYPES,
      ["submitted", "approved", "returned", "commented", "reminder"],
    ],
  ])("%s", (_name, actual, expected) => {
    expect(actual).toEqual(expected);
  });

  test.each([
    ["role", ROLE_LABELS, { member: "一般", manager: "上長", admin: "管理者" }],
    [
      "status(日報)",
      REPORT_STATUS_LABELS,
      { draft: "下書き", submitted: "提出済み", returned: "差し戻し", approved: "承認済み" },
    ],
    [
      "category(作業区分)",
      WORK_CATEGORY_LABELS,
      { visit: "訪問", travel: "移動", document: "資料作成", meeting: "社内会議", other: "その他" },
    ],
    [
      "stage(商談)",
      DEAL_STAGE_LABELS,
      { lead: "見込み", proposal: "提案中", negotiation: "交渉中", won: "受注", lost: "失注" },
    ],
    ["action(承認履歴)", REVIEW_ACTION_LABELS, { approved: "承認", returned: "差し戻し" }],
  ])("%s の日本語ラベル", (_name, actual, expected) => {
    expect(actual).toEqual(expected);
  });

  test("通知の種類の日本語ラベルは画面定義書 SCR-14 の種類と一致する", () => {
    expect(NOTIFICATION_TYPE_LABELS).toEqual({
      submitted: "提出",
      approved: "承認",
      returned: "差し戻し",
      commented: "コメント",
      reminder: "リマインド",
    });
  });
});

describe("列挙値のスキーマ", () => {
  test.each([
    ["role", roleSchema, "admin", "owner"],
    ["status", reportStatusSchema, "returned", "rejected"],
    ["category", workCategorySchema, "document", "visiting"],
    ["stage", dealStageSchema, "won", "estimate"],
    ["action", reviewActionSchema, "approved", "submitted"],
    ["type", notificationTypeSchema, "reminder", "mentioned"],
  ])("%s は定義済みの値だけを受け付ける", (_name, schema, valid, invalid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });
});
