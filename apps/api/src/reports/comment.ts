import { type ReportComment, toJstDateTimeString } from "@nippo/shared";
import type { User } from "../../generated/prisma/client";
import { now } from "../clock";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { createNotifications } from "../notifications";
import { canCommentReport, visibleReportsWhere } from "./access";

// 日報へのコメント(F-44、F-53)

/**
 * 日報にコメントを投稿し、投稿者以外の作成者と上長に通知する(下書きへのコメントは上長に通知しない)。
 * 閲覧できない日報、コメントできない日報は null を返す(呼び出し側で 404 にする)
 */
export const postComment = async (
  db: Db,
  commenter: Pick<User, "id" | "role" | "name">,
  id: number,
  body: string,
): Promise<ReportComment | null> => {
  const report = await db.dailyReport.findFirst({
    where: { AND: [{ id }, visibleReportsWhere(commenter)] },
    select: {
      userId: true,
      reportDate: true,
      status: true,
      user: { select: { id: true, name: true, managerId: true } },
    },
  });
  if (!report) return null;
  // 閲覧できても、コメントできるのは作成者と直属の上長だけ(CMT-04、CMT-05)
  if (!canCommentReport(commenter, { ...report, managerId: report.user.managerId })) return null;

  return db.$transaction(async (tx) => {
    const comment = await tx.reportComment.create({
      data: { reportId: id, userId: commenter.id, body, createdAt: now() },
      select: { id: true, body: true, createdAt: true, user: { select: { id: true, name: true } } },
    });
    await createNotifications(tx, {
      type: "commented",
      report: {
        id,
        reportDate: toDateOnly(report.reportDate),
        status: report.status,
        author: report.user,
      },
      commenter: { id: commenter.id, name: commenter.name },
    });
    return {
      id: comment.id,
      user: comment.user,
      body: comment.body,
      created_at: toJstDateTimeString(comment.createdAt),
    };
  });
};
