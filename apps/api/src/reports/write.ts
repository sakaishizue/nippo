import { type ErrorDetail, type ReportInputData, todayInJst } from "@nippo/shared";
import type { Prisma } from "../../generated/prisma/client";
import { now } from "../clock";
import type { Db } from "../db";
import { AppError } from "../errors";

// 日報の作成と更新(POST /reports、PUT /reports/{id})で共通に使う処理

type WorkEntryData = ReportInputData["work_entries"][number];

export const validationError = (details: ErrorDetail[]) =>
  new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", { details });

/** 日付の文字列を、データベースの日付型(UTC の0時)にする */
export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** 未来の日付は不可(日本時間の今日まで) */
export const assertNotFuture = (reportDate: string) => {
  if (reportDate > todayInJst(now())) {
    throw validationError([{ field: "report_date", message: "未来の日付は選べません" }]);
  }
};

/**
 * 作業の商談と訪問先の顧客が存在し、訪問の商談の顧客が訪問先と一致することを確かめる。
 * 誤りは行ごとにまとめて 422 にする(`work_entries[0].deal_id` など)
 */
export const assertReferences = async (db: Db, entries: WorkEntryData[]) => {
  const dealIds = [...new Set(entries.flatMap((e) => (e.deal_id === null ? [] : [e.deal_id])))];
  const customerIds = [...new Set(entries.flatMap((e) => (e.visit ? [e.visit.customer_id] : [])))];
  const [deals, customers] = await Promise.all([
    db.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, customerId: true } }),
    db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true } }),
  ]);
  const dealCustomer = new Map(deals.map((deal) => [deal.id, deal.customerId]));
  const customerExists = new Set(customers.map((customer) => customer.id));

  const details: ErrorDetail[] = [];
  entries.forEach((entry, index) => {
    const field = `work_entries[${index}]`;
    if (entry.visit && !customerExists.has(entry.visit.customer_id)) {
      details.push({ field: `${field}.visit.customer_id`, message: "顧客が見つかりません" });
    }
    if (entry.deal_id === null) return;
    const customerId = dealCustomer.get(entry.deal_id);
    if (customerId === undefined) {
      details.push({ field: `${field}.deal_id`, message: "商談が見つかりません" });
    } else if (entry.visit && customerId !== entry.visit.customer_id) {
      // 訪問の商談は、訪問先の顧客の商談に限る(画面定義書 SCR-04、RPT-10)
      details.push({ field: `${field}.deal_id`, message: "訪問先の顧客の商談を選んでください" });
    }
  });
  if (details.length > 0) throw validationError(details);
};

/** 作業と訪問の詳細を作るデータ(日報の作成では入れ子で、更新では reportId を付けて使う) */
export const workEntryCreateData = (entry: WorkEntryData) =>
  ({
    category: entry.category,
    minutes: entry.minutes,
    dealId: entry.deal_id,
    note: entry.note,
    ...(entry.visit && {
      visit: {
        create: {
          customerId: entry.visit.customer_id,
          contactName: entry.visit.contact_name,
          content: entry.visit.content,
          nextAction: entry.visit.next_action,
        },
      },
    }),
  }) satisfies Prisma.WorkEntryUncheckedCreateWithoutReportInput;

/** 同じ日付の日報がある(F-11)。画面がその日報を開けるよう、既存の日報のIDを返す */
export const reportAlreadyExists = (existingReportId: number) =>
  new AppError("REPORT_ALREADY_EXISTS", "同じ日付の日報があります", {
    extra: { existing_report_id: existingReportId },
  });

export const findReportOn = (db: Db, userId: number, reportDate: string) =>
  db.dailyReport.findUnique({
    where: { userId_reportDate: { userId, reportDate: toDbDate(reportDate) } },
    select: { id: true },
  });

export const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
