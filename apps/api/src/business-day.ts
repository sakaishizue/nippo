import holidayJp from "@holiday-jp/holiday_jp";
import { dateSchema } from "@nippo/shared";

// 営業日の判定。土日と祝日(振替休日、国民の休日を含む)を休日とする。会社独自の休業日(年末年始など)は扱わない
// 日付は日本時間の `YYYY-MM-DD` で受け取る。holiday_jp に Date を渡すとサーバーのタイムゾーン(Cloud Run では UTC)で
// 年月日を取り出し、日本時間の0時から9時の間は前日として判定されてしまうため、必ず文字列で渡す

const parse = (date: string): Date => {
  if (!dateSchema.safeParse(date).success) {
    throw new RangeError(`date must be YYYY-MM-DD: ${date}`);
  }
  return new Date(`${date}T00:00:00Z`);
};

const toDateString = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: string, days: number): string => {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
};

/** 土曜日か日曜日か */
export const isWeekend = (date: string): boolean => {
  const day = parse(date).getUTCDay();
  return day === 0 || day === 6;
};

/** 祝日(振替休日、国民の休日を含む)か */
export const isHoliday = (date: string): boolean => {
  parse(date);
  return holidayJp.isHoliday(date);
};

/** 営業日(土日と祝日以外)か */
export const isBusinessDay = (date: string): boolean => !isWeekend(date) && !isHoliday(date);

/** 指定した日より前の、直近の営業日 */
export const previousBusinessDay = (date: string): string => {
  let candidate = addDays(date, -1);
  while (!isBusinessDay(candidate)) candidate = addDays(candidate, -1);
  return candidate;
};
