import { describe, expect, test } from "vitest";
import { formatMinutes } from "./format";

describe("formatMinutes", () => {
  test.each([
    [0, "0分"],
    [30, "30分"],
    [59, "59分"],
    [60, "1時間"],
    [61, "1時間1分"],
    [450, "7時間30分"],
    [750, "12時間30分"],
    [1440, "24時間"],
  ])("%i分は「%s」", (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  test.each([-1, 1.5, Number.NaN])("%s はエラーになる", (minutes) => {
    expect(() => formatMinutes(minutes)).toThrow(RangeError);
  });
});
