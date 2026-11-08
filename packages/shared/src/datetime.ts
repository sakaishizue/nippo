import { z } from "zod";

// API仕様書 1.1 の日付(YYYY-MM-DD)と日時(ISO 8601、日本時間)
export const dateSchema = z.iso.date();
export const dateTimeSchema = z.iso.datetime({ offset: true });

// 日本時間には夏時間がないため、UTC に9時間を足した時刻で日付と時刻を求める
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const toJstShifted = (date: Date): string => new Date(date.getTime() + JST_OFFSET_MS).toISOString();

/** 日本時間の日付を `YYYY-MM-DD` で返す */
export const toJstDateString = (date: Date): string => toJstShifted(date).slice(0, 10);

/** 日本時間の日時を `2026-11-06T18:30:00+09:00` の形式で返す(ミリ秒は切り捨てる) */
export const toJstDateTimeString = (date: Date): string =>
  `${toJstShifted(date).slice(0, 19)}+09:00`;

/** 日本時間の今日の日付を `YYYY-MM-DD` で返す */
export const todayInJst = (now: Date = new Date()): string => toJstDateString(now);
