import { calendarSchema } from "@nippo/shared";
import { describe, expect, test } from "vitest";
import { createTestApp, loginAs } from "../testing/auth";
import { seedTestData, type TestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";

// シードの日報: U1 は 11月2日(承認済み)、3日(差し戻し)、4日(提出済み)、5日(下書き)。U3 は 11月4日(提出済み)

type Role = keyof TestData["users"];

const setup = async () => {
  const data = await seedTestData(testDb);
  const calendar = async (role: Role, query: string) => {
    const client = await loginAs(createTestApp(), data.users[role]);
    return client.request(`/api/v1/calendar${query}`);
  };
  return { ...data, calendar };
};

describe("GET /calendar", () => {
  test("CAL-01: 一般は、月の全日の休日と祝日、自分の日報のステータス(下書きを含む)", async () => {
    const { calendar, reports } = await setup();
    const res = await calendar("U1", "?month=2026-11");
    expect(res.status).toBe(200);
    const body = calendarSchema.parse(await res.json());
    expect(body.month).toBe("2026-11");
    expect(body.days).toHaveLength(30);
    expect(body.days[0]?.date).toBe("2026-11-01");
    expect(body.days.at(-1)?.date).toBe("2026-11-30");

    const day = (date: string) => body.days.find((d) => d.date === date);
    expect(day("2026-11-02")).toEqual({
      date: "2026-11-02",
      day_off: false,
      holiday_name: null,
      report: { id: reports["R-app"].id, status: "approved" },
    });
    // 文化の日(祝日)の差し戻しの日報
    expect(day("2026-11-03")).toEqual({
      date: "2026-11-03",
      day_off: true,
      holiday_name: "文化の日",
      report: { id: reports["R-ret"].id, status: "returned" },
    });
    expect(day("2026-11-04")?.report).toEqual({ id: reports["R-sub"].id, status: "submitted" });
    expect(day("2026-11-05")?.report).toEqual({ id: reports["R-draft"].id, status: "draft" });
    // 土曜日、日曜日、勤労感謝の日(23日、月曜日)は休日
    expect(day("2026-11-07")).toMatchObject({ day_off: true, holiday_name: null, report: null });
    expect(day("2026-11-08")).toMatchObject({ day_off: true, holiday_name: null });
    expect(day("2026-11-23")).toMatchObject({ day_off: true, holiday_name: "勤労感謝の日" });
    expect(day("2026-11-06")).toMatchObject({ day_off: false, report: null });
    expect(body.days.filter((d) => d.day_off)).toHaveLength(11);
  });

  test("CAL-02: 他の一般の日報を含まない", async () => {
    const { calendar } = await setup();
    // U3 は 11月4日に提出済みの日報がある。U2 には日報がない
    const u2 = calendarSchema.parse(await (await calendar("U2", "?month=2026-11")).json());
    expect(u2.days.every((d) => d.report === null)).toBe(true);
  });

  test.each<Role>(["M1", "A1"])(
    "CAL-03: 上長と管理者(%s)には、部下の日報があってもステータスを返さない",
    async (role) => {
      const { calendar } = await setup();
      const res = await calendar(role, "?month=2026-11");
      expect(res.status).toBe(200);
      const body = calendarSchema.parse(await res.json());
      expect(body.days).toHaveLength(30);
      expect(body.days.every((d) => d.report === null)).toBe(true);
      expect(body.days.find((d) => d.date === "2026-11-03")?.holiday_name).toBe("文化の日");
    },
  );

  test.each(["", "?month=2026-13", "?month=2026-1", "?month=1999-12", "?month=2051-01"])(
    "CAL-04: 月の指定の誤り(%s)は 422",
    async (query) => {
      const { calendar } = await setup();
      const res = await calendar("U1", query);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { details: { field: string }[] } };
      expect(body.error.details[0]?.field).toBe("month");
    },
  );

  test("CAL-05: うるう年の2月は29日まで", async () => {
    const { calendar } = await setup();
    const body = calendarSchema.parse(await (await calendar("U1", "?month=2028-02")).json());
    expect(body.days).toHaveLength(29);
    expect(body.days.at(-1)?.date).toBe("2028-02-29");
  });

  test("未ログインは 401", async () => {
    const res = await createTestApp().request("/api/v1/calendar?month=2026-11");
    expect(res.status).toBe(401);
  });
});
