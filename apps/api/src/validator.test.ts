import { describe, expect, test } from "vitest";
import { toFieldPath } from "./validator";

describe("toFieldPath", () => {
  test.each([
    [["report_date"], "report_date"],
    [["work_entries", 0, "minutes"], "work_entries[0].minutes"],
    [["work_entries", 2, "visit", "customer_id"], "work_entries[2].visit.customer_id"],
    [["matrix", 1, 3], "matrix[1][3]"],
    [[], ""],
  ])("%j → %s", (path, expected) => {
    expect(toFieldPath(path)).toBe(expected);
  });
});
