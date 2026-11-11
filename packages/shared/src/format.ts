import { toJstDateTimeString } from "./datetime";

/** 分を「7時間30分」の形式にする(画面定義書 SCR-03、SCR-07) */
export const formatMinutes = (minutes: number): string => {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`minutes must be a non-negative integer: ${minutes}`);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** `YYYY-MM-DD` を「2026年11月4日(水)」の形式にする。曜日は日付そのものから求める(タイムゾーンに左右されない) */
export const formatDate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`date must be YYYY-MM-DD: ${date}`);
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}年${m}月${d}日(${weekday})`;
};

/** 金額を「3,000,000円」の形式にする(画面定義書 SCR-11 の3桁区切り) */
export const formatYen = (amount: number): string => `${amount.toLocaleString("ja-JP")}円`;

/** 日時(ISO 8601)を、日本時間の「2026年11月6日(金) 18:30」の形式にする */
export const formatDateTime = (dateTime: string): string => {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) throw new RangeError(`invalid date-time: ${dateTime}`);
  const jst = toJstDateTimeString(date);
  return `${formatDate(jst.slice(0, 10))} ${jst.slice(11, 16)}`;
};
