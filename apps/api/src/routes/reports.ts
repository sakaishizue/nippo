import {
  commentInputSchema,
  paginationQuerySchema,
  reportInputSchema,
  reportListQuerySchema,
  reportSubmitIssues,
  returnInputSchema,
} from "@nippo/shared";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthEnv, requireRole } from "../auth/middleware";
import { now } from "../clock";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { AppError } from "../errors";
import { createNotifications } from "../notifications";
import { postComment } from "../reports/comment";
import { findReportDetail } from "../reports/detail";
import { findPendingReports, reviewReport } from "../reports/review";
import { searchReports } from "../reports/search";
import {
  assertNotFuture,
  assertReferences,
  findReportOn,
  isUniqueViolation,
  reportAlreadyExists,
  toDbDate,
  validationError,
  workEntryCreateData,
} from "../reports/write";
import { validate } from "../validator";

type Options = { db: Db };

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** 閲覧範囲の外の日報は、存在を知られないよう 404 にする(API仕様書 1.3) */
export const reportNotFound = () => new AppError("NOT_FOUND", "日報が見つかりません");

const EDITABLE = ["draft", "returned"] as const;

/** 日報API(API仕様書 5章) */
export const reportsRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>()
    // 日報を下書きとして作る。日報を書くのは一般だけ(要件定義書 2章)
    .post("/", requireRole("member"), validate("json", reportInputSchema), async (c) => {
      const input = c.req.valid("json");
      const user = c.var.user;
      assertNotFuture(input.report_date);
      await assertReferences(db, input.work_entries);

      const existing = await findReportOn(db, user.id, input.report_date);
      if (existing) throw reportAlreadyExists(existing.id);

      let id: number;
      try {
        ({ id } = await db.dailyReport.create({
          data: {
            userId: user.id,
            reportDate: toDbDate(input.report_date),
            status: "draft",
            reflection: input.reflection,
            nextPlan: input.next_plan,
            workEntries: { create: input.work_entries.map(workEntryCreateData) },
          },
          select: { id: true },
        }));
      } catch (error) {
        // 確かめてから作るまでの間に、同じ日付の日報が作られた場合
        if (!isUniqueViolation(error)) throw error;
        const created = await findReportOn(db, user.id, input.report_date);
        if (!created) throw error;
        throw reportAlreadyExists(created.id);
      }
      return c.json(await findReportDetail(db, id, user), 201);
    })

    // 日報の検索(F-14)。閲覧範囲の日報だけを返す
    .get("/", validate("query", reportListQuerySchema), async (c) =>
      c.json(await searchReports(db, c.var.user, c.req.valid("query"))),
    )

    // 承認待ちの一覧(F-45)。直属の部下の提出済みの日報を、提出日時の古い順に返す
    .get("/pending", requireRole("manager"), validate("query", paginationQuerySchema), async (c) =>
      c.json(await findPendingReports(db, c.var.user, c.req.valid("query"))),
    )

    // `/reports/pending` などと区別するため、ID は数字だけ
    .get("/:id{[0-9]+}", validate("param", idParamSchema), async (c) => {
      const detail = await findReportDetail(db, c.req.valid("param").id, c.var.user);
      if (!detail) throw reportNotFound();
      return c.json(detail);
    })

    // 日報の内容を丸ごと置き換える。作業と訪問の詳細は、送った内容で全件を置き換える。ステータスは変えない
    .put(
      "/:id{[0-9]+}",
      requireRole("member"),
      validate("param", idParamSchema),
      validate("json", reportInputSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const input = c.req.valid("json");
        const user = c.var.user;

        // 他人の日報は 404(RPT-21)
        const report = await db.dailyReport.findFirst({ where: { id, userId: user.id } });
        if (!report) throw reportNotFound();
        if (!(EDITABLE as readonly string[]).includes(report.status)) {
          throw new AppError("INVALID_STATUS", "提出済みと承認済みの日報は編集できません");
        }

        const dateChanged = toDateOnly(report.reportDate) !== input.report_date;
        if (dateChanged && report.status === "returned") {
          throw validationError([
            { field: "report_date", message: "差し戻し中は日付を変更できません" },
          ]);
        }
        assertNotFuture(input.report_date);
        await assertReferences(db, input.work_entries);
        if (dateChanged) {
          const other = await findReportOn(db, user.id, input.report_date);
          if (other) throw reportAlreadyExists(other.id);
        }

        try {
          await db.$transaction(async (tx) => {
            // 確かめてから保存するまでに提出された場合に備え、ステータスを条件にして更新する
            const { count } = await tx.dailyReport.updateMany({
              where: { id, status: { in: [...EDITABLE] } },
              data: {
                reportDate: toDbDate(input.report_date),
                reflection: input.reflection,
                nextPlan: input.next_plan,
              },
            });
            if (count === 0) {
              throw new AppError("INVALID_STATUS", "提出済みと承認済みの日報は編集できません");
            }
            // 作業を消すと、訪問の詳細も消える(onDelete: Cascade)
            await tx.workEntry.deleteMany({ where: { reportId: id } });
            for (const entry of input.work_entries) {
              await tx.workEntry.create({ data: { reportId: id, ...workEntryCreateData(entry) } });
            }
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const other = await findReportOn(db, user.id, input.report_date);
          if (!other) throw error;
          throw reportAlreadyExists(other.id);
        }
        return c.json(await findReportDetail(db, id, user));
      },
    )

    // 日報を提出する(F-13)。上長への通知(F-51)を同じトランザクションで作る
    .post(
      "/:id{[0-9]+}/submit",
      requireRole("member"),
      validate("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const user = c.var.user;

        // 他人の日報は 404(SUB-09)
        const report = await db.dailyReport.findFirst({
          where: { id, userId: user.id },
          include: { workEntries: { include: { visit: true }, orderBy: { id: "asc" } } },
        });
        if (!report) throw reportNotFound();
        if (!(EDITABLE as readonly string[]).includes(report.status)) {
          throw new AppError("INVALID_STATUS", "下書きか差し戻しの日報だけを提出できます");
        }

        const issues = reportSubmitIssues({
          reflection: report.reflection,
          next_plan: report.nextPlan,
          work_entries: report.workEntries.map((entry) => ({
            category: entry.category,
            visit: entry.visit ? { content: entry.visit.content } : null,
          })),
        });
        if (issues.length > 0) throw validationError(issues);

        await db.$transaction(async (tx) => {
          // 確かめてから提出するまでに、別の操作で提出された場合に備え、ステータスを条件にする
          const { count } = await tx.dailyReport.updateMany({
            where: { id, status: { in: [...EDITABLE] } },
            data: { status: "submitted", submittedAt: now() },
          });
          if (count === 0) {
            throw new AppError("INVALID_STATUS", "下書きか差し戻しの日報だけを提出できます");
          }
          await createNotifications(tx, {
            type: "submitted",
            report: {
              id,
              reportDate: toDateOnly(report.reportDate),
              status: "submitted",
              author: { id: user.id, name: user.name, managerId: user.managerId },
            },
          });
        });
        return c.json(await findReportDetail(db, id, user));
      },
    )

    // 承認(F-41)。直属の上長が、提出済みの日報だけを承認できる
    .post(
      "/:id{[0-9]+}/approve",
      requireRole("manager"),
      validate("param", idParamSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        if (!(await reviewReport(db, c.var.user, id, "approved", null))) throw reportNotFound();
        return c.json(await findReportDetail(db, id, c.var.user));
      },
    )

    // 差し戻し(F-41、F-42)。理由は必須
    .post(
      "/:id{[0-9]+}/return",
      requireRole("manager"),
      validate("param", idParamSchema),
      validate("json", returnInputSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const { reason } = c.req.valid("json");
        if (!(await reviewReport(db, c.var.user, id, "returned", reason))) throw reportNotFound();
        return c.json(await findReportDetail(db, id, c.var.user));
      },
    )

    // コメント投稿(F-44)。作成者と直属の上長だけが投稿できる。管理者は 403(CMT-06)
    .post(
      "/:id{[0-9]+}/comments",
      requireRole("member", "manager"),
      validate("param", idParamSchema),
      validate("json", commentInputSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const comment = await postComment(db, c.var.user, id, c.req.valid("json").body);
        if (!comment) throw reportNotFound();
        return c.json(comment, 201);
      },
    );
