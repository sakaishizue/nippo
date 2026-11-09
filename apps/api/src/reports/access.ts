import type { ReportPermissions, ReportStatus } from "@nippo/shared";
import type { Prisma, User } from "../../generated/prisma/client";

// 日報の閲覧範囲と操作の権限(API仕様書 5章「日報の閲覧範囲」、要件定義書 2章)。日報を扱うすべての API で使う

type Viewer = Pick<User, "id" | "role">;

/**
 * ログイン中のユーザーが閲覧できる日報の条件
 * - 一般: 自分の日報(すべてのステータス)
 * - 上長: 直属の部下の、提出済み以降の日報(下書きは見せない)
 * - 管理者: 全員の、提出済み以降の日報
 */
export const visibleReportsWhere = (viewer: Viewer): Prisma.DailyReportWhereInput => {
  switch (viewer.role) {
    case "member":
      return { userId: viewer.id };
    case "manager":
      return { user: { managerId: viewer.id }, status: { not: "draft" } };
    case "admin":
      return { status: { not: "draft" } };
  }
};

/** 権限の判定に使う日報の項目 */
export type ReportForPermissions = {
  userId: number;
  status: ReportStatus;
  /** 作成者の上長 */
  managerId: number | null;
};

const isAuthor = (viewer: Viewer, report: ReportForPermissions) =>
  viewer.role === "member" && report.userId === viewer.id;

const isDirectManager = (viewer: Viewer, report: ReportForPermissions) =>
  viewer.role === "manager" && report.managerId === viewer.id;

/** 本人で、下書きか差し戻しのときだけ編集できる */
export const canEditReport = (viewer: Viewer, report: ReportForPermissions) =>
  isAuthor(viewer, report) && (report.status === "draft" || report.status === "returned");

/** 直属の上長で、提出済みのときだけ承認、差し戻しできる */
export const canReviewReport = (viewer: Viewer, report: ReportForPermissions) =>
  isDirectManager(viewer, report) && report.status === "submitted";

/** 本人と直属の上長がコメントできる。上長は下書きを閲覧できないため、下書きには本人だけ */
export const canCommentReport = (viewer: Viewer, report: ReportForPermissions) =>
  isAuthor(viewer, report) || (isDirectManager(viewer, report) && report.status !== "draft");

/** GET /reports/{id} の permissions(画面のボタンを出すかの判定に使う) */
export const reportPermissions = (
  viewer: Viewer,
  report: ReportForPermissions,
): ReportPermissions => ({
  can_edit: canEditReport(viewer, report),
  can_review: canReviewReport(viewer, report),
  can_comment: canCommentReport(viewer, report),
});
