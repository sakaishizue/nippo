import { hashPassword } from "../auth/password";
import type { Db } from "../db";

// テスト仕様書 3章のテストデータ。APIテストと開発用のシード(prisma/seed.ts)で共通に使う

/** テストデータの全ユーザーのパスワード。開発用のデータベースでもこのパスワードでログインできる */
export const TEST_PASSWORD = "password123";

// ハッシュ化には時間がかかるため、プロセスごとに1回だけ計算する
let testPasswordHash: Promise<string> | undefined;

// 日報の日付。2026-11-02(月)から始まる週
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const at = (dateTime: string) => new Date(dateTime);

export const seedTestData = async (db: Db) => {
  testPasswordHash ??= hashPassword(TEST_PASSWORD);
  const passwordHash = await testPasswordHash;

  // 3.1 ユーザー
  const A1 = await db.user.create({
    data: {
      name: "管理 太郎",
      email: "a1@example.com",
      role: "admin",
      passwordHash,
    },
  });
  const M1 = await db.user.create({
    data: {
      name: "鈴木 一郎",
      email: "m1@example.com",
      role: "manager",
      passwordHash,
    },
  });
  const M2 = await db.user.create({
    data: {
      name: "高橋 次郎",
      email: "m2@example.com",
      role: "manager",
      passwordHash,
    },
  });
  const member = (name: string, email: string, managerId: number, isActive = true) =>
    db.user.create({
      data: { name, email, role: "member", managerId, isActive, passwordHash },
    });
  const U1 = await member("山田 太郎", "u1@example.com", M1.id);
  const U2 = await member("佐藤 花子", "u2@example.com", M1.id);
  const U3 = await member("田中 三郎", "u3@example.com", M2.id);
  const X1 = await member("伊藤 四郎", "x1@example.com", M1.id, false);

  // 3.2 顧客と商談
  const C1 = await db.customer.create({
    data: { name: "A株式会社", address: "東京都千代田区丸の内1-1-1", phone: "03-1234-5678" },
  });
  const C2 = await db.customer.create({
    data: { name: "B株式会社", address: "大阪府大阪市北区梅田2-2-2", phone: "06-1234-5678" },
  });
  const D1 = await db.deal.create({
    data: {
      customerId: C1.id,
      ownerId: U1.id,
      name: "新サービス導入",
      stage: "proposal",
      amount: 3_000_000,
      expectedCloseDate: day("2026-12-20"),
    },
  });
  const D2 = await db.deal.create({
    data: { customerId: C2.id, ownerId: U2.id, name: "保守契約の更新", stage: "negotiation" },
  });

  // 3.3 日報
  const approved = await db.dailyReport.create({
    data: {
      userId: U1.id,
      reportDate: day("2026-11-02"),
      status: "approved",
      reflection: "提案資料の反応がよかった",
      nextPlan: "見積の準備",
      submittedAt: at("2026-11-02T18:00:00+09:00"),
      workEntries: {
        create: [
          {
            category: "visit",
            minutes: 90,
            dealId: D1.id,
            visit: {
              create: {
                customerId: C1.id,
                contactName: "田中部長",
                content: "新サービスの提案",
                nextAction: "来週までに見積を提示",
              },
            },
          },
          { category: "travel", minutes: 60 },
        ],
      },
      reviews: {
        create: {
          reviewerId: M1.id,
          action: "approved",
          createdAt: at("2026-11-02T19:00:00+09:00"),
        },
      },
    },
  });
  const returned = await db.dailyReport.create({
    data: {
      userId: U1.id,
      reportDate: day("2026-11-03"),
      status: "returned",
      reflection: "B社の担当者が交代していた",
      nextPlan: "新しい担当者に連絡",
      submittedAt: at("2026-11-03T18:00:00+09:00"),
      workEntries: {
        create: {
          category: "visit",
          minutes: 60,
          visit: { create: { customerId: C2.id, content: "担当者の交代の確認" } },
        },
      },
      reviews: {
        create: {
          reviewerId: M1.id,
          action: "returned",
          reason: "訪問内容をもう少し具体的に",
          createdAt: at("2026-11-03T19:00:00+09:00"),
        },
      },
    },
  });
  const submitted = await db.dailyReport.create({
    data: {
      userId: U1.id,
      reportDate: day("2026-11-04"),
      status: "submitted",
      reflection: "見積の条件を確認できた",
      nextPlan: "見積書の作成",
      submittedAt: at("2026-11-04T18:00:00+09:00"),
      workEntries: {
        create: {
          category: "visit",
          minutes: 90,
          dealId: D1.id,
          visit: {
            create: { customerId: C1.id, contactName: "田中部長", content: "見積の条件の確認" },
          },
        },
      },
    },
  });
  const draft = await db.dailyReport.create({
    data: {
      userId: U1.id,
      reportDate: day("2026-11-05"),
      status: "draft",
      workEntries: {
        create: {
          category: "visit",
          minutes: 60,
          visit: { create: { customerId: C1.id, content: "見積書の説明" } },
        },
      },
    },
  });
  const u3Submitted = await db.dailyReport.create({
    data: {
      userId: U3.id,
      reportDate: day("2026-11-04"),
      status: "submitted",
      reflection: "定例の訪問",
      nextPlan: "社内会議",
      submittedAt: at("2026-11-04T17:30:00+09:00"),
      workEntries: {
        create: {
          category: "visit",
          minutes: 60,
          visit: { create: { customerId: C2.id, content: "定例の打ち合わせ" } },
        },
      },
    },
  });

  return {
    users: { A1, M1, M2, U1, U2, U3, X1 },
    customers: { C1, C2 },
    deals: { D1, D2 },
    reports: {
      "R-draft": draft,
      "R-sub": submitted,
      "R-ret": returned,
      "R-app": approved,
      "R-u3": u3Submitted,
    },
  };
};

export type TestData = Awaited<ReturnType<typeof seedTestData>>;
