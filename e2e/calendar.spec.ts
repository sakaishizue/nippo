import { expect, type Page, test } from "@playwright/test";
import { asAdmin, heading, loginAs, openMenu, PASSWORD } from "./helpers";

// サイドナビのカレンダー(画面定義書 3.1)。スマートフォンではハンバーガーメニューの中に出す。
// 日報のない過去の日を使うため、実行ごとに上長と一般を1組登録して使い、最後に無効にする

const registered: number[] = [];

test.afterEach(async ({ request }) => {
  const admin = await asAdmin(request);
  // 部下がいる上長は無効にできないため、一般、上長の順に無効にする
  for (const id of registered.splice(0)) {
    const res = await request.patch(`/api/v1/users/${id}`, {
      ...admin,
      data: { is_active: false },
    });
    expect(res.status()).toBe(200);
  }
});

const registerTeam = async (page: Page, projectName: string) => {
  const admin = await asAdmin(page);
  const suffix = `${projectName}-${Date.now()}`;
  const register = async (data: Record<string, unknown>) => {
    const res = await page.request.post("/api/v1/users", {
      ...admin,
      data: { password: PASSWORD, is_active: true, ...data },
    });
    expect(res.status()).toBe(201);
    return (await res.json()) as { id: number; email: string };
  };
  const manager = await register({
    name: "暦 上長",
    email: `e2e-cal-manager-${suffix}@example.com`,
    role: "manager",
  });
  const member = await register({
    name: "暦 担当",
    email: `e2e-cal-member-${suffix}@example.com`,
    role: "member",
    manager_id: manager.id,
  });
  registered.push(member.id, manager.id);
  return { manager: manager.email, member: member.email };
};

/** 表示しているカレンダー。スマートフォンでは、メニューを開いてから探す */
const openCalendar = async (page: Page) => {
  await openMenu(page);
  const calendar = page.getByRole("region", { name: "カレンダー" }).filter({ visible: true });
  await expect(calendar).toBeVisible();
  return calendar;
};

/** カレンダーの日付の読み上げの先頭(「2026年11月3日」) */
const dayName = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new RegExp(`^${y}年${m}月${d}日`);
};

// テスト仕様書 E2E-20
test("一般がカレンダーで日報のない過去の日を選んで作成し、上長はその日の日報一覧を開く。土日祝日は赤", async ({
  page,
}, testInfo) => {
  test.slow();
  const { manager, member } = await registerTeam(page, testInfo.project.name);

  // 一般: 前の月の、日報のない営業日(未作成)を選ぶと、その日付で日報入力が開く
  await loginAs(page, member);
  await page.goto("/");
  await expect(heading(page)).toHaveText("ホーム");
  let calendar = await openCalendar(page);
  await calendar.getByRole("button", { name: "前の月" }).click();
  const missing = calendar.getByRole("link", { name: /未作成/ }).first();
  await expect(missing).toBeVisible();
  await missing.click();
  await expect(page).toHaveURL(/\/reports\/new\?date=\d{4}-\d{2}-\d{2}$/);
  const date = new URL(page.url()).searchParams.get("date") as string;
  await expect(heading(page)).toHaveText("日報作成");
  await expect(page.getByLabel("日付")).toHaveValue(date);

  // 下書きを保存すると、カレンダーでその日が選択中になり、「下書き」と示される。
  // 新規作成の最初の作業の行(未入力)は削除する(下書きは作業なしでも保存できる)
  await page.getByRole("button", { name: "作業1を削除" }).click();
  await page.getByRole("button", { name: "下書き保存" }).click();
  await expect(page).toHaveURL(/\/reports\/\d+$/);
  calendar = await openCalendar(page);
  const saved = calendar.getByRole("link", { name: dayName(date) });
  await expect(saved).toHaveAttribute("aria-current", "date");
  await expect(saved).toHaveAccessibleName(/下書き/);

  // 上長: 同じ日を選ぶと、その日の日報一覧が開く(下書きは上長に見せないため、日報のステータスは示さない)
  await loginAs(page, manager);
  await page.goto("/");
  await expect(heading(page)).toHaveText("ホーム");
  calendar = await openCalendar(page);
  await calendar.getByRole("button", { name: "前の月" }).click();
  const day = calendar.getByRole("link", { name: dayName(date) });
  await expect(day).not.toHaveAccessibleName(/下書き|未作成/);
  await day.click();
  await expect(page).toHaveURL(`/reports?from=${date}&to=${date}`);
  await expect(heading(page)).toHaveText("日報一覧");

  // 土日と祝日は赤(1日だけの日報一覧を開くと、その月を表示する)。2026年11月は1日が日曜日、3日が文化の日
  await page.goto("/reports?from=2026-11-03&to=2026-11-03");
  await expect(heading(page)).toHaveText("日報一覧");
  calendar = await openCalendar(page);
  const holiday = calendar.getByRole("link", { name: dayName("2026-11-03") });
  await expect(holiday).toHaveAccessibleName(/文化の日/);
  await expect(holiday).toHaveAttribute("aria-current", "date");
  const sunday = calendar.getByRole("link", { name: dayName("2026-11-01") });
  const monday = calendar.getByRole("link", { name: dayName("2026-11-02") });
  const color = (locator: typeof sunday) => locator.evaluate((el) => getComputedStyle(el).color);
  const red = await color(sunday);
  expect(red).not.toBe(await color(monday));
  // 選択中の日は基本色の面に白い文字のため、選択していない休日(土曜日)で同じ赤を確かめる
  expect(await color(calendar.getByRole("link", { name: dayName("2026-11-07") }))).toBe(red);
});
