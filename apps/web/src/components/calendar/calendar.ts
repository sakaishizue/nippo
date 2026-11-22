import {
  addMonths,
  CALENDAR_FIRST_MONTH,
  CALENDAR_LAST_MONTH,
  type CalendarDay,
  dayOfWeek,
  formatDate,
  REPORT_STATUS_LABELS,
  type ReportStatus,
  type Role,
} from "@nippo/shared";

// サイドナビのカレンダー(画面定義書 3.1)の表示と、日付を選んだときの移動先

/** 月を移動できるか(祝日のデータがある 2000年1月から2050年12月まで) */
export const canMoveMonth = (month: string, months: number): boolean => {
  const next = addMonths(month, months);
  return next >= CALENDAR_FIRST_MONTH && next <= CALENDAR_LAST_MONTH;
};

/** 土曜日か日曜日か。祝日は API の holiday_name で判定する(画面に祝日のデータを持たない) */
export const isWeekend = (date: string): boolean => {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
};

/** カレンダーの日の印。一般の日報のステータスと、過去の営業日で日報がない日(未作成) */
export type DayMark = ReportStatus | "missing";

export const DAY_MARK_LABELS: Record<DayMark, string> = {
  ...REPORT_STATUS_LABELS,
  missing: "未作成",
};

/** 一般の日の印。今日と未来の日報がない日、休日の日報がない日は印を付けない */
export const dayMarkOf = (
  day: Pick<CalendarDay, "date" | "day_off" | "report">,
  today: string,
): DayMark | null => {
  if (day.report) return day.report.status;
  return !day.day_off && day.date < today ? "missing" : null;
};

/**
 * 日付を選んだときの移動先。未来の日は選べない(null)。
 * 一般は、日報がなければその日付で新規作成、下書きと差し戻しは編集、提出済みと承認済みは詳細。
 * 上長と管理者は、その日の日報一覧
 */
export const dayLinkOf = (
  role: Role,
  date: string,
  report: CalendarDay["report"] | undefined,
  today: string,
): string | null => {
  if (date > today) return null;
  if (role !== "member") return `/reports?${new URLSearchParams({ from: date, to: date })}`;
  if (!report) return `/reports/new?date=${date}`;
  return report.status === "draft" || report.status === "returned"
    ? `/reports/${report.id}/edit`
    : `/reports/${report.id}`;
};

/** 日付の読み上げ。「2026年11月3日(火) 文化の日 差し戻し」など */
export const dayLabelOf = (
  date: string,
  options: { holidayName?: string | null; mark?: DayMark | null; today?: boolean },
): string =>
  [
    formatDate(date),
    options.today ? "今日" : null,
    options.holidayName ?? null,
    options.mark ? DAY_MARK_LABELS[options.mark] : null,
  ]
    .filter(Boolean)
    .join(" ");
