import {
  DEAL_STAGES,
  NOTIFICATION_TYPES,
  REPORT_STATUSES,
  REVIEW_ACTIONS,
  ROLES,
  WORK_CATEGORIES,
} from "@nippo/shared";
import { describe, expect, test } from "vitest";
import {
  DealStage,
  NotificationType,
  ReportStatus,
  ReviewAction,
  Role,
  WorkCategory,
} from "../generated/prisma/enums";

// データベースの列挙値(Prisma のスキーマ)が、画面とAPIで共有する値と一致していることを確認する
describe("Prisma の列挙値と @nippo/shared の値", () => {
  test.each([
    ["Role", Role, ROLES],
    ["ReportStatus", ReportStatus, REPORT_STATUSES],
    ["WorkCategory", WorkCategory, WORK_CATEGORIES],
    ["DealStage", DealStage, DEAL_STAGES],
    ["ReviewAction", ReviewAction, REVIEW_ACTIONS],
    ["NotificationType", NotificationType, NOTIFICATION_TYPES],
  ])("%s", (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum)).toEqual(sharedValues);
  });
});
