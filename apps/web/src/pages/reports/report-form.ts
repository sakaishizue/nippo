import {
  type ReportDetail,
  type ReportInput,
  reportInputSchema,
  reportSubmitIssues,
  todayInJst,
  type WorkCategory,
} from "@nippo/shared";
import { type FieldErrors, get, type Resolver, set } from "react-hook-form";
import type { DealOption } from "@/components/deals/DealCombobox";
import { toFormFieldName } from "@/lib/form-errors";

// SCR-04 日報入力の入力。数値の欄は文字列で持ち、送るときに API の形(POST /reports)にする。
// 入力チェックは API と同じ @nippo/shared のスキーマで行う

export type Option = { id: number; name: string };

export type VisitFormValues = {
  customer: Option | null;
  contact_name: string;
  content: string;
  next_action: string;
};

export type WorkEntryFormValues = {
  category: WorkCategory;
  minutes: string;
  deal: DealOption | null;
  note: string;
  // 作業区分を切り替えても入力が消えないように、訪問以外の行にも持つ。送るのは訪問の行だけ
  visit: VisitFormValues;
};

export type ReportFormValues = {
  report_date: string;
  reflection: string;
  next_plan: string;
  work_entries: WorkEntryFormValues[];
};

const emptyVisit = (): VisitFormValues => ({
  customer: null,
  contact_name: "",
  content: "",
  next_action: "",
});

/** 追加する作業の行。営業の日報で最も多い訪問にしておく */
export const newWorkEntry = (): WorkEntryFormValues => ({
  category: "visit",
  minutes: "",
  deal: null,
  note: "",
  visit: emptyVisit(),
});

/** 入力欄の初期値。新規は今日の日付で、作業を1行出しておく */
export const reportFormDefaults = (
  report?: ReportDetail,
  today = todayInJst(),
): ReportFormValues =>
  report
    ? {
        report_date: report.report_date,
        reflection: report.reflection ?? "",
        next_plan: report.next_plan ?? "",
        work_entries: report.work_entries.map((entry) => ({
          category: entry.category,
          minutes: String(entry.minutes),
          // 訪問の商談の顧客は訪問先と同じ(API で確かめている)
          deal: entry.deal ? { ...entry.deal, customer: entry.visit?.customer ?? null } : null,
          note: entry.note ?? "",
          visit: entry.visit
            ? {
                customer: entry.visit.customer,
                contact_name: entry.visit.contact_name ?? "",
                content: entry.visit.content ?? "",
                next_action: entry.visit.next_action ?? "",
              }
            : emptyVisit(),
        })),
      }
    : { report_date: today, reflection: "", next_plan: "", work_entries: [newWorkEntry()] };

/** 時間(分)の入力を数値にする。全角の数字も受け付ける。整数でなければ NaN(スキーマのエラーになる) */
export const parseMinutes = (value: string): number => {
  const normalized = value
    .trim()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  return /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
};

/** 合計時間(分)。数値になっていない行は数えない */
export const totalMinutesOf = (entries: readonly Pick<WorkEntryFormValues, "minutes">[]): number =>
  entries.reduce((sum, entry) => {
    const minutes = parseMinutes(entry.minutes);
    return Number.isNaN(minutes) ? sum : sum + minutes;
  }, 0);

/** POST /reports と PUT /reports/{id} のリクエスト。訪問の詳細は、作業区分が訪問の行だけに付ける */
export const toReportRequest = (values: ReportFormValues): ReportInput => ({
  report_date: values.report_date,
  reflection: values.reflection,
  next_plan: values.next_plan,
  work_entries: values.work_entries.map((entry) => ({
    category: entry.category,
    minutes: parseMinutes(entry.minutes),
    deal_id: entry.deal?.id ?? null,
    note: entry.note,
    visit:
      entry.category === "visit"
        ? {
            // 未選択は 0 にして、スキーマの「顧客を選択してください」にする
            customer_id: entry.visit.customer?.id ?? 0,
            contact_name: entry.visit.contact_name,
            content: entry.visit.content,
            next_action: entry.visit.next_action,
          }
        : null,
  })),
});

/**
 * API の項目名(`work_entries[0].visit.customer_id`)を、フォームの名前(`work_entries.0.visit.customer`)にする。
 * 作業全体のエラー(1件以上、合計の上限)は、行の配列の `root` に入れる
 */
export const toReportFormField = (field: string): string => {
  const name = toFormFieldName(field);
  if (name === "work_entries") return "work_entries.root";
  return name.replace(/\.visit\.customer_id$/, ".visit.customer").replace(/\.deal_id$/, ".deal");
};

type FlatError = { name: string; message: string };

/** 項目のエラーを React Hook Form の形にする。同じ項目は最初のエラーだけ */
const toFieldErrors = (errors: readonly FlatError[]): FieldErrors<ReportFormValues> => {
  const result: FieldErrors<ReportFormValues> = {};
  for (const { name, message } of errors) {
    if (get(result, name)) continue;
    set(result, name, { type: "validate", message });
  }
  return result;
};

/** 保存(下書き保存と提出の前)の入力チェック */
export const reportFormErrors = (values: ReportFormValues, today = todayInJst()): FlatError[] => {
  const errors: FlatError[] = [];
  if (values.report_date === "") {
    errors.push({ name: "report_date", message: "日付を入力してください" });
  } else if (values.report_date > today) {
    errors.push({ name: "report_date", message: "未来の日付は選べません" });
  }
  const result = reportInputSchema.safeParse(toReportRequest(values));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = toReportFormField(issue.path.join("."));
      // 日付の形式の誤りは、上で日本語のメッセージにしている
      if (name === "report_date") continue;
      errors.push({ name, message: issue.message });
    }
  }
  return errors;
};

/** React Hook Form の resolver。エラーがあれば項目に表示し、保存しない */
export const reportFormResolver: Resolver<ReportFormValues> = (values) => {
  const errors = reportFormErrors(values);
  return errors.length === 0
    ? { values, errors: {} }
    : { values: {}, errors: toFieldErrors(errors) };
};

/** 提出時のチェック(作業が1件以上、訪問内容、所感、翌日の予定)。API と同じ関数を使う */
export const reportSubmitErrors = (values: ReportFormValues): FlatError[] =>
  reportSubmitIssues({
    reflection: values.reflection,
    next_plan: values.next_plan,
    work_entries: values.work_entries.map((entry) => ({
      category: entry.category,
      visit: entry.category === "visit" ? { content: entry.visit.content } : null,
    })),
  }).map(({ field, message }) => ({ name: toReportFormField(field), message }));

/** 最新の差し戻しの理由(差し戻し中に画面上部に出す) */
export const latestReturnReason = (report: Pick<ReportDetail, "reviews">): string | null =>
  report.reviews.findLast((review) => review.action === "returned")?.reason ?? null;
