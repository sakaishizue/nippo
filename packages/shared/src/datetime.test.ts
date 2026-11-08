import { describe, expect, test } from "vitest";
import {
  dateSchema,
  dateTimeSchema,
  todayInJst,
  toJstDateString,
  toJstDateTimeString,
} from "./datetime";

describe("dateSchema", () => {
  test.each(["2026-11-06", "2028-02-29"])("%s を受け付ける", (value) => {
    expect(dateSchema.safeParse(value).success).toBe(true);
  });

  test.each(["2026-11-6", "2026-02-30", "2026/11/06", "2026-11-06T00:00:00+09:00"])(
    "%s は受け付けない",
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("dateTimeSchema", () => {
  test("API仕様書 1.1 の例(日本時間)を受け付ける", () => {
    expect(dateTimeSchema.safeParse("2026-11-06T18:30:00+09:00").success).toBe(true);
  });

  test.each(["2026-11-06T18:30+09:00", "2026-11-06T18:30:00", "2026-11-06"])(
    "%s は受け付けない",
    (value) => {
      expect(dateTimeSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("日本時間への変換", () => {
  test("UTC の15時は日本時間の翌日0時になる", () => {
    const date = new Date("2026-11-06T15:00:00Z");
    expect(toJstDateString(date)).toBe("2026-11-07");
    expect(toJstDateTimeString(date)).toBe("2026-11-07T00:00:00+09:00");
  });

  test("UTC の14時59分は日本時間ではまだ同じ日", () => {
    expect(toJstDateString(new Date("2026-11-06T14:59:59Z"))).toBe("2026-11-06");
  });

  test("年をまたぐ日付", () => {
    expect(toJstDateString(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });

  test("ミリ秒は切り捨てる", () => {
    expect(toJstDateTimeString(new Date("2026-11-06T09:30:00.999Z"))).toBe(
      "2026-11-06T18:30:00+09:00",
    );
  });

  test("変換した日時は dateTimeSchema を通る", () => {
    expect(dateTimeSchema.safeParse(toJstDateTimeString(new Date())).success).toBe(true);
  });

  test("todayInJst は指定した時刻の日本時間の日付を返す", () => {
    expect(todayInJst(new Date("2026-11-07T23:00:00Z"))).toBe("2026-11-08");
  });
});
