import { DEAL_STAGES } from "@nippo/shared";
import { isBusinessDay } from "../business-day";
import type { Db } from "../db";
import { type NotifiedReport, notificationMessage } from "../notifications";

// 性能テスト(テスト仕様書 NFR-04、05、13)のデータ。50人が5年間使った量(日報約6万件)を作る。
// ステージングで使い、測定後に deletePerfData() で消す。実データは使わない。
// 消すときに他のデータと区別するため、ユーザーのメールアドレスと顧客名に目印を付ける

/** 性能テストのユーザーのメールアドレスのドメイン */
export const PERF_EMAIL_DOMAIN = "perf.example.com";
/** 性能テストの顧客名の先頭 */
export const PERF_CUSTOMER_PREFIX = "性能テスト";

export const perfEmail = (local: string) => `${local}@${PERF_EMAIL_DOMAIN}`;

export type PerfDataOptions = {
  /** パスワードのハッシュ値(全員で共通) */
  passwordHash: string;
  /** 日報の最後の日(`YYYY-MM-DD`)。この日までの営業日に日報を作る */
  lastDate: string;
  /** 日報を作る年数 */
  years?: number;
  managers?: number;
  membersPerManager?: number;
  customers?: number;
  deals?: number;
  /** 進み具合の表示 */
  onProgress?: (message: string) => void;
};

export type PerfDataSummary = {
  users: number;
  customers: number;
  deals: number;
  reports: number;
  workEntries: number;
  visits: number;
  reviews: number;
  comments: number;
  notifications: number;
};

/** 再現できる乱数(mulberry32)。毎回同じデータになるよう、種を固定する */
const createRandom = (seed: number) => {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  return { next, int, pick };
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 期間の営業日(古い順) */
export const businessDaysBetween = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isBusinessDay(date)) days.push(date);
  }
  return days;
};

/** 日本時間の日時 */
const jst = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`);
const dateOnly = (date: string) => new Date(`${date}T00:00:00Z`);

const FAMILY_NAMES = [
  "佐藤",
  "鈴木",
  "高橋",
  "田中",
  "伊藤",
  "渡辺",
  "山本",
  "中村",
  "小林",
  "加藤",
];
const GIVEN_NAMES = ["一郎", "花子", "健太", "美咲", "大輔", "陽子", "翔太", "直子", "拓也", "恵"];
const PREFECTURES = [
  "東京都千代田区",
  "東京都港区",
  "神奈川県横浜市",
  "大阪府大阪市",
  "愛知県名古屋市",
];
const DEAL_NAMES = [
  "新サービス導入",
  "保守契約の更新",
  "システム刷新",
  "追加ライセンス",
  "研修の提案",
];
const CONTACTS = ["部長", "課長", "係長", "担当者", "社長"];
const VISIT_CONTENTS = [
  "新サービスの提案を行い、導入の時期と予算を確認した",
  "見積の条件をすり合わせ、来月の稟議に向けた資料を依頼された",
  "定例の打ち合わせ。現行システムの不満点をヒアリングした",
  "契約更新の意向を確認した。価格の見直しを求められている",
  "競合の提案内容を聞き、こちらの強みを説明した",
];
const NEXT_ACTIONS = [
  "来週までに見積を提示",
  "資料を送付",
  "次回の訪問日を調整",
  "社内で条件を確認",
  null,
];
const REFLECTIONS = [
  "提案資料の反応がよく、次の段階に進めそうだ",
  "移動の時間が長く、訪問の順番を見直したい",
  "顧客の課題を深く聞けた。提案の方向性が固まった",
  "見積の根拠の説明が足りなかった。資料を改善する",
];
const NEXT_PLANS = [
  "見積書の作成と送付",
  "既存顧客へのフォロー訪問",
  "社内会議で案件の共有",
  "提案資料の作成",
];
const COMMENTS = [
  "次回の訪問の結果も共有してください",
  "よく進んでいますね",
  "見積の条件を相談しましょう",
];

/** 性能テストのデータを入れる。既に入っている場合はエラー */
export const insertPerfData = async (
  db: Db,
  options: PerfDataOptions,
): Promise<PerfDataSummary> => {
  const {
    passwordHash,
    lastDate,
    years = 5,
    managers: managerCount = 5,
    membersPerManager = 10,
    customers: customerCount = 500,
    deals: dealCount = 1000,
    onProgress = () => {},
  } = options;
  if ((await countPerfUsers(db)) > 0) {
    throw new Error("性能テストのデータが既にあります。先に削除してください");
  }
  const random = createRandom(20261115);
  const summary: PerfDataSummary = {
    users: 0,
    customers: 0,
    deals: 0,
    reports: 0,
    workEntries: 0,
    visits: 0,
    reviews: 0,
    comments: 0,
    notifications: 0,
  };

  // ユーザー: 管理者1人、上長、上長ごとの一般
  await db.user.create({
    data: { name: "性能 管理者", email: perfEmail("perf-admin"), role: "admin", passwordHash },
  });
  const managers = await db.user.createManyAndReturn({
    data: Array.from({ length: managerCount }, (_, i) => ({
      name: `性能 上長${pad(i + 1)}`,
      email: perfEmail(`perf-m${pad(i + 1)}`),
      role: "manager" as const,
      passwordHash,
    })),
    select: { id: true, name: true },
  });
  const members = await db.user.createManyAndReturn({
    data: managers.flatMap((manager, m) =>
      Array.from({ length: membersPerManager }, (_, i) => {
        const n = m * membersPerManager + i + 1;
        return {
          name: `性能${pad(n)} ${random.pick(GIVEN_NAMES)}`,
          email: perfEmail(`perf-u${pad(n)}`),
          role: "member" as const,
          managerId: manager.id,
          passwordHash,
        };
      }),
    ),
    select: { id: true, name: true, managerId: true },
  });
  summary.users = 1 + managers.length + members.length;
  const managerName = new Map(managers.map((m) => [m.id, m.name]));

  // 顧客と商談
  const customers = await db.customer.createManyAndReturn({
    data: Array.from({ length: customerCount }, (_, i) => ({
      name: `${PERF_CUSTOMER_PREFIX}顧客${pad(i + 1, 3)} ${random.pick(FAMILY_NAMES)}商事`,
      address: `${random.pick(PREFECTURES)}${random.int(1, 9)}-${random.int(1, 20)}-${random.int(1, 30)}`,
      phone: `03-${random.int(1000, 9999)}-${random.int(1000, 9999)}`,
    })),
    select: { id: true },
  });
  summary.customers = customers.length;
  const deals = await db.deal.createManyAndReturn({
    data: Array.from({ length: dealCount }, (_, i) => ({
      customerId: random.pick(customers).id,
      ownerId: random.pick(members).id,
      name: `${random.pick(DEAL_NAMES)} ${pad(i + 1, 4)}`,
      stage: random.pick(DEAL_STAGES),
      amount: random.int(10, 1000) * 10_000,
      expectedCloseDate: dateOnly(addDays(lastDate, random.int(-365, 365))),
    })),
    select: { id: true, customerId: true },
  });
  summary.deals = deals.length;
  const dealsOfCustomer = new Map<number, number[]>();
  for (const deal of deals) {
    dealsOfCustomer.set(deal.customerId, [
      ...(dealsOfCustomer.get(deal.customerId) ?? []),
      deal.id,
    ]);
  }

  const firstDate = addDays(`${Number(lastDate.slice(0, 4)) - years}${lastDate.slice(4)}`, 1);
  const days = businessDaysBetween(firstDate, lastDate);
  // 最後の数日は、承認待ちや差し戻し中、下書きを混ぜる
  const recent = new Set(days.slice(-5));

  // 一般ごとに、日報と、その作業、訪問、承認履歴、コメント、通知を入れる
  for (const [index, member] of members.entries()) {
    const managerId = member.managerId as number;
    const reportDays = days.filter(() => random.next() >= 0.02); // 休暇などで2%は日報がない
    const statusOf = (date: string) => {
      if (!recent.has(date)) return "approved" as const;
      const r = random.next();
      if (r < 0.15) return "draft" as const;
      if (r < 0.25) return "returned" as const;
      if (r < 0.65) return "submitted" as const;
      return "approved" as const;
    };
    const plans = reportDays.map((date) => ({ date, status: statusOf(date) }));

    const reports = await db.dailyReport.createManyAndReturn({
      data: plans.map(({ date, status }) => ({
        userId: member.id,
        reportDate: dateOnly(date),
        status,
        reflection: status === "draft" ? null : random.pick(REFLECTIONS),
        nextPlan: status === "draft" ? null : random.pick(NEXT_PLANS),
        submittedAt: status === "draft" ? null : jst(date, `18:${pad(random.int(0, 59))}`),
        createdAt: jst(date, "17:00"),
      })),
      select: { id: true, reportDate: true, status: true },
    });

    // 作業: 訪問1〜3件、移動、資料作成か社内会議
    type Entry = {
      reportId: number;
      dealId: number | null;
      category: "visit" | "travel" | "document" | "meeting" | "other";
      minutes: number;
      note: string | null;
      visitCustomerId?: number;
    };
    const entries: Entry[] = [];
    for (const report of reports) {
      for (let v = random.int(1, 3); v > 0; v--) {
        const customerId = random.pick(customers).id;
        const candidates = dealsOfCustomer.get(customerId) ?? [];
        const dealId =
          candidates.length > 0 && random.next() < 0.6 ? random.pick(candidates) : null;
        entries.push({
          reportId: report.id,
          dealId,
          category: "visit",
          minutes: random.int(4, 12) * 10,
          note: null,
          visitCustomerId: customerId,
        });
      }
      entries.push({
        reportId: report.id,
        dealId: null,
        category: "travel",
        minutes: random.int(3, 9) * 10,
        note: null,
      });
      entries.push({
        reportId: report.id,
        dealId: null,
        category: random.pick(["document", "meeting", "other"] as const),
        minutes: random.int(3, 12) * 10,
        note: random.next() < 0.3 ? "週次の資料" : null,
      });
    }
    const created = await db.workEntry.createManyAndReturn({
      data: entries.map(({ visitCustomerId: _, ...entry }) => entry),
      select: { id: true, reportId: true, category: true },
    });
    // 1つの INSERT の中では、送った順に ID が振られる。念のため区分が一致するかを確かめる
    created.sort((a, b) => a.id - b.id);
    if (created.some((row, i) => row.category !== entries[i]?.category)) {
      throw new Error("作業の並び順が送った順と一致しません");
    }
    const visits = created.flatMap((row, i) => {
      const customerId = entries[i]?.visitCustomerId;
      if (customerId === undefined) return [];
      return [
        {
          workEntryId: row.id,
          customerId,
          contactName: `${random.pick(FAMILY_NAMES)}${random.pick(CONTACTS)}`,
          content: random.pick(VISIT_CONTENTS),
          nextAction: random.pick(NEXT_ACTIONS),
        },
      ];
    });
    await db.visit.createMany({ data: visits });

    // 承認履歴、コメント、通知
    const reviews: {
      reportId: number;
      reviewerId: number;
      action: "approved" | "returned";
      reason: string | null;
      createdAt: Date;
    }[] = [];
    const comments: { reportId: number; userId: number; body: string; createdAt: Date }[] = [];
    const notifications: {
      userId: number;
      reportId: number;
      type: "submitted" | "approved" | "returned" | "commented";
      message: string;
      readAt: Date | null;
      createdAt: Date;
    }[] = [];
    const commenter = { id: managerId, name: managerName.get(managerId) ?? "" };
    for (const report of reports) {
      if (report.status === "draft") continue;
      const date = report.reportDate.toISOString().slice(0, 10);
      const isRecent = recent.has(date);
      const notified: NotifiedReport = {
        id: report.id,
        reportDate: date,
        status: report.status,
        author: { id: member.id, name: member.name, managerId },
      };
      const next = addDays(date, 1);
      const read = (at: Date) => (isRecent ? null : new Date(at.getTime() + 60 * 60 * 1000));
      const submittedAt = jst(date, "18:30");
      notifications.push({
        userId: managerId,
        reportId: report.id,
        type: "submitted",
        message: notificationMessage({ type: "submitted", report: notified }),
        readAt: read(submittedAt),
        createdAt: submittedAt,
      });
      // 承認済みの5%と差し戻し中は、差し戻しの履歴を持つ
      const wasReturned = report.status === "returned" || random.next() < 0.05;
      if (wasReturned) {
        const at = jst(next, "09:30");
        reviews.push({
          reportId: report.id,
          reviewerId: managerId,
          action: "returned",
          reason: "訪問内容をもう少し具体的に",
          createdAt: at,
        });
        notifications.push({
          userId: member.id,
          reportId: report.id,
          type: "returned",
          message: notificationMessage({ type: "returned", report: notified }),
          readAt: read(at),
          createdAt: at,
        });
      }
      if (report.status === "approved") {
        const at = jst(next, "10:00");
        reviews.push({
          reportId: report.id,
          reviewerId: managerId,
          action: "approved",
          createdAt: at,
          reason: null,
        });
        notifications.push({
          userId: member.id,
          reportId: report.id,
          type: "approved",
          message: notificationMessage({ type: "approved", report: notified }),
          readAt: read(at),
          createdAt: at,
        });
      }
      if (random.next() < 0.1) {
        const at = jst(next, "10:05");
        comments.push({
          reportId: report.id,
          userId: managerId,
          body: random.pick(COMMENTS),
          createdAt: at,
        });
        notifications.push({
          userId: member.id,
          reportId: report.id,
          type: "commented",
          message: notificationMessage({ type: "commented", report: notified, commenter }),
          readAt: read(at),
          createdAt: at,
        });
      }
    }
    await db.reportReview.createMany({ data: reviews });
    await db.reportComment.createMany({ data: comments });
    await db.notification.createMany({ data: notifications });

    summary.reports += reports.length;
    summary.workEntries += created.length;
    summary.visits += visits.length;
    summary.reviews += reviews.length;
    summary.comments += comments.length;
    summary.notifications += notifications.length;
    onProgress(`${index + 1}/${members.length}人目まで入れました(日報 ${summary.reports}件)`);
  }
  return summary;
};

const perfUserWhere = { email: { endsWith: `@${PERF_EMAIL_DOMAIN}` } };

/** 性能テストのユーザーの人数 */
export const countPerfUsers = (db: Db) => db.user.count({ where: perfUserWhere });

/** 性能テストのデータの件数(削除の前の確認に使う) */
export const countPerfData = async (db: Db) => {
  const [users, customers, reports] = await Promise.all([
    countPerfUsers(db),
    db.customer.count({ where: { name: { startsWith: PERF_CUSTOMER_PREFIX } } }),
    db.dailyReport.count({ where: { user: perfUserWhere } }),
  ]);
  return { users, customers, reports };
};

/**
 * 性能テストのデータを消す。目印の付いたユーザーと顧客、それに紐づく日報、商談、通知だけを消す。
 * 他のデータが性能テストのユーザーや顧客を参照している場合は、データベースが削除を拒否し、何も消さない
 */
export const deletePerfData = async (db: Db, onProgress: (message: string) => void = () => {}) => {
  const users = await db.user.findMany({ where: perfUserWhere, select: { id: true, role: true } });
  const userIds = users.map((u) => u.id);
  const customerWhere = { name: { startsWith: PERF_CUSTOMER_PREFIX } };
  await db.$transaction(
    async (tx) => {
      // 日報は一般ごとに消す(1回の削除が大きくなりすぎないように)。作業、訪問、承認履歴、コメント、日報の通知も消える
      for (const [index, userId] of userIds.entries()) {
        await tx.dailyReport.deleteMany({ where: { userId } });
        onProgress(`${index + 1}/${userIds.length}人目の日報を消しました`);
      }
      await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
      await tx.deal.deleteMany({
        where: { OR: [{ ownerId: { in: userIds } }, { customer: customerWhere }] },
      });
      await tx.customer.deleteMany({ where: customerWhere });
      // 上長は部下から参照されているため、一般を先に消す
      await tx.user.deleteMany({ where: { id: { in: userIds }, role: "member" } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    },
    { timeout: 30 * 60 * 1000, maxWait: 60 * 1000 },
  );
};
