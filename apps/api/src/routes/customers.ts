import {
  type CustomerDetail,
  type CustomerListItem,
  customerInputSchema,
  customerListQuerySchema,
} from "@nippo/shared";
import { Hono } from "hono";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import type { AuthEnv } from "../auth/middleware";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { AppError } from "../errors";
import { validate } from "../validator";

type Options = { db: Db };

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const NOT_FOUND = () => new AppError("NOT_FOUND", "顧客が見つかりません");

/** 顧客API(API仕様書 7章)。全ロールが使える(F-22) */
export const customersRoutes = ({ db }: Options) => {
  /** 顧客ごとの最終訪問日。提出済みと承認済みの日報の訪問だけを対象にする(F-24、CUS-10) */
  const lastVisitedOn = async (customerIds: number[]): Promise<Map<number, string>> => {
    if (customerIds.length === 0) return new Map();
    const rows = await db.$queryRaw<{ customer_id: number; last_visited_on: Date }[]>`
      SELECT v.customer_id, MAX(r.report_date) AS last_visited_on
      FROM visits v
      JOIN work_entries w ON w.id = v.work_entry_id
      JOIN daily_reports r ON r.id = w.report_id
      WHERE r.status IN ('submitted', 'approved')
        AND v.customer_id IN (${Prisma.join(customerIds)})
      GROUP BY v.customer_id`;
    return new Map(rows.map((row) => [row.customer_id, toDateOnly(row.last_visited_on)]));
  };

  const findDetail = async (id: number): Promise<CustomerDetail | null> => {
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        deals: {
          include: { owner: { select: { id: true, name: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!customer) return null;
    return {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      phone: customer.phone,
      deals: customer.deals.map((deal) => ({
        id: deal.id,
        name: deal.name,
        owner: deal.owner,
        stage: deal.stage,
        amount: deal.amount,
        expected_close_date: deal.expectedCloseDate ? toDateOnly(deal.expectedCloseDate) : null,
      })),
    };
  };

  /** 同じ名前の顧客があれば 409。確認済み(confirm_duplicate)なら登録できる(画面定義書 SCR-10) */
  const assertNameAvailable = async (name: string, confirmed: boolean, exceptId?: number) => {
    if (confirmed) return;
    const duplicate = await db.customer.findFirst({
      where: { name, ...(exceptId !== undefined && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("DUPLICATE_CUSTOMER_NAME", "同じ名前の顧客が登録されています");
    }
  };

  return new Hono<AuthEnv>()
    .get("/", validate("query", customerListQuerySchema), async (c) => {
      const { q, page, per_page } = c.req.valid("query");
      const where: Prisma.CustomerWhereInput = q
        ? { name: { contains: q, mode: "insensitive" } }
        : {};
      const [customers, total] = await db.$transaction([
        db.customer.findMany({
          where,
          include: { _count: { select: { deals: true } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: (page - 1) * per_page,
          take: per_page,
        }),
        db.customer.count({ where }),
      ]);
      const lastVisits = await lastVisitedOn(customers.map((customer) => customer.id));
      const items: CustomerListItem[] = customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        deal_count: customer._count.deals,
        last_visited_on: lastVisits.get(customer.id) ?? null,
      }));
      return c.json({ items, pagination: { page, per_page, total } });
    })

    .post("/", validate("json", customerInputSchema), async (c) => {
      const { name, address, phone, confirm_duplicate } = c.req.valid("json");
      await assertNameAvailable(name, confirm_duplicate);
      const { id } = await db.customer.create({
        data: { name, address, phone },
        select: { id: true },
      });
      return c.json(await findDetail(id), 201);
    })

    .get("/:id", validate("param", idParamSchema), async (c) => {
      const detail = await findDetail(c.req.valid("param").id);
      if (!detail) throw NOT_FOUND();
      return c.json(detail);
    })

    .put(
      "/:id",
      validate("param", idParamSchema),
      validate("json", customerInputSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const { name, address, phone, confirm_duplicate } = c.req.valid("json");
        const exists = await db.customer.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw NOT_FOUND();
        // 名前の重複は、自分自身を除いて確かめる(CUS-04)
        await assertNameAvailable(name, confirm_duplicate, id);
        await db.customer.update({ where: { id }, data: { name, address, phone } });
        return c.json(await findDetail(id));
      },
    );
};
