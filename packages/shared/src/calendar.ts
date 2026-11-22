import { z } from "zod";
import { dateSchema } from "./datetime";
import { reportStatusSchema } from "./enums";

// API仕様書 4章(GET /calendar)。サイドナビのカレンダー(画面定義書 3.1)

/** カレンダーで表示できる最初と最後の月。祝日のデータ(@holiday-jp/holiday_jp)は 2050年まで */
export const CALENDAR_FIRST_MONTH = "2000-01";
export const CALENDAR_LAST_MONTH = "2050-12";

/** 月(`YYYY-MM`) */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM の形式で入力してください")
  .refine(
    (month) => month >= CALENDAR_FIRST_MONTH && month <= CALENDAR_LAST_MONTH,
    "2000年1月から2050年12月までの月を指定してください",
  );

export const calendarQuerySchema = z.object({ month: monthSchema });

export const calendarDaySchema = z.object({
  date: dateSchema,
  // 休日(土日と祝日)。API の営業日の判定(isBusinessDay)の逆
  day_off: z.boolean(),
  // 祝日の名前(振替休日、国民の休日を含む)。祝日でなければ null
  holiday_name: z.string().nullable(),
  // 一般の自分のその日の日報。日報がない日と、一般以外のロールは null
  report: z.object({ id: z.number().int(), status: reportStatusSchema }).nullable(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

export const calendarSchema = z.object({
  month: z.string(),
  // その月の1日から月末まで、日付の順
  days: z.array(calendarDaySchema),
});
export type Calendar = z.infer<typeof calendarSchema>;

/** 日付(`YYYY-MM-DD`)の月(`YYYY-MM`) */
export const monthOf = (date: string): string => date.slice(0, 7);

/** 月(`YYYY-MM`)の months か月後(負の数で前) */
export const addMonths = (month: string, months: number): string => {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mon - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/** 月(`YYYY-MM`)のすべての日付(`YYYY-MM-DD`)。1日から月末まで */
export const datesOfMonth = (month: string): string[] => {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  // 翌月の0日 = その月の末日(UTC で計算し、タイムゾーンでずらさない)
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

/** 日付(`YYYY-MM-DD`)の曜日。0 が日曜日、6 が土曜日 */
export const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
