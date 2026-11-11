import { REPORT_STATUSES, type ReportStatus, type Role, reportStatusSchema } from "@nippo/shared";

// SCR-03 日報一覧の検索条件。URL のクエリに持つ(画面定義書 3.4)

/** `YYYY-MM-DD` の1か月前の日付。前の月にその日がなければ、前の月の末日 */
export const monthBefore = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, Math.min(d, lastDay)));
  return prev.toISOString().slice(0, 10);
};

/** 期間の初期値(直近1か月) */
export const defaultPeriod = (today: string) => ({ from: monthBefore(today), to: today });

/** 選べるステータス。上長と管理者には下書きを見せないため、下書きを出さない */
export const statusOptions = (role: Role): readonly ReportStatus[] =>
  role === "member" ? REPORT_STATUSES : REPORT_STATUSES.filter((status) => status !== "draft");

export type ReportSearch = {
  /** 期間。URL にない場合は初期値(直近1か月)、空の文字列は指定なし */
  from: string;
  to: string;
  userId: number | null;
  customerId: number | null;
  statuses: ReportStatus[];
  q: string;
};

const idFrom = (value: string | null) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** URL のクエリから検索条件を読む */
export const reportSearchFrom = (searchParams: URLSearchParams, today: string): ReportSearch => {
  const period = defaultPeriod(today);
  return {
    from: searchParams.get("from") ?? period.from,
    to: searchParams.get("to") ?? period.to,
    userId: idFrom(searchParams.get("user_id")),
    customerId: idFrom(searchParams.get("customer_id")),
    statuses: searchParams
      .getAll("status")
      .filter((status): status is ReportStatus => reportStatusSchema.safeParse(status).success),
    q: searchParams.get("q") ?? "",
  };
};

/** 検索条件を URL のクエリにする。期間が初期値と同じなら URL に入れない(空の文字列は「指定なし」として残す) */
export const reportSearchQuery = (search: ReportSearch, today: string) => {
  const period = defaultPeriod(today);
  return {
    from: search.from === period.from ? null : search.from,
    to: search.to === period.to ? null : search.to,
    user_id: search.userId,
    customer_id: search.customerId,
    status: search.statuses,
    q: search.q.trim() || null,
  };
};
