import {
  type DealDetailResponse,
  type DealResponse,
  dealInputSchema,
  dealListQuerySchema,
  paginationQuerySchema,
} from "@nippo/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Deal, Prisma } from "../../generated/prisma/client";
import type { AuthEnv } from "../auth/middleware";
import { toDateOnly } from "../dates";
import type { Db } from "../db";
import { AppError } from "../errors";
import { validate } from "../validator";
import { findVisitHistory, toDealVisit } from "../visits";

type Options = { db: Db };

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const withRefs = {
  customer: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} as const;
type DealWithRefs = Deal & {
  customer: { id: number; name: string };
  owner: { id: number; name: string };
};

const toDealResponse = (deal: DealWithRefs): DealResponse => ({
  id: deal.id,
  name: deal.name,
  customer: deal.customer,
  owner: deal.owner,
  stage: deal.stage,
  amount: deal.amount,
  expected_close_date: deal.expectedCloseDate ? toDateOnly(deal.expectedCloseDate) : null,
});

const fieldError = (field: string, message: string) =>
  new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", { details: [{ field, message }] });

const NOT_FOUND = () => new AppError("NOT_FOUND", "商談が見つかりません");

/** 日付の文字列を、データベースの日付型(UTC の0時)にする */
const toDbDate = (date: string | null) => (date === null ? null : new Date(`${date}T00:00:00Z`));

/** 商談API(API仕様書 8章)。全ロールが使える(F-23) */
export const dealsRoutes = ({ db }: Options) => {
  /** 訪問記録があるか。下書きの日報の訪問も含める(顧客を変えると、訪問先と商談の顧客が食い違うため) */
  const hasVisits = async (dealId: number) =>
    (await db.visit.count({ where: { workEntry: { dealId } } })) > 0;

  const findDetail = async (id: number): Promise<DealDetailResponse | null> => {
    const deal = await db.deal.findUnique({ where: { id }, include: withRefs });
    if (!deal) return null;
    return { ...toDealResponse(deal), has_visits: await hasVisits(id) };
  };

  const assertCustomerExists = async (customerId: number) => {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw fieldError("customer_id", "顧客が見つかりません");
  };

  /** 担当者に選べるのは、有効な一般のユーザーだけ */
  const assertValidOwner = async (ownerId: number) => {
    const owner = await db.user.findUnique({ where: { id: ownerId } });
    if (owner?.role !== "member" || !owner.isActive) {
      throw fieldError("owner_id", "担当者は有効な一般のユーザーから選んでください");
    }
  };

  return (
    new Hono<AuthEnv>()
      .get("/", validate("query", dealListQuerySchema), async (c) => {
        const { q, customer_id, owner_id, stage, page, per_page } = c.req.valid("query");
        const where: Prisma.DealWhereInput = {
          ...(q && { name: { contains: q, mode: "insensitive" } }),
          ...(customer_id !== undefined && { customerId: customer_id }),
          ...(owner_id !== undefined && { ownerId: owner_id }),
          ...(stage && stage.length > 0 && { stage: { in: stage } }),
        };
        const [deals, total] = await db.$transaction([
          db.deal.findMany({
            where,
            include: withRefs,
            // 登録の新しい順
            orderBy: { id: "desc" },
            skip: (page - 1) * per_page,
            take: per_page,
          }),
          db.deal.count({ where }),
        ]);
        return c.json({ items: deals.map(toDealResponse), pagination: { page, per_page, total } });
      })

      .post("/", validate("json", dealInputSchema), async (c) => {
        const input = c.req.valid("json");
        await assertCustomerExists(input.customer_id);
        await assertValidOwner(input.owner_id);
        const { id } = await db.deal.create({
          data: {
            customerId: input.customer_id,
            name: input.name,
            ownerId: input.owner_id,
            stage: input.stage,
            amount: input.amount,
            expectedCloseDate: toDbDate(input.expected_close_date),
          },
          select: { id: true },
        });
        return c.json(await findDetail(id), 201);
      })

      .get("/:id", validate("param", idParamSchema), async (c) => {
        const detail = await findDetail(c.req.valid("param").id);
        if (!detail) throw NOT_FOUND();
        return c.json(detail);
      })

      // 訪問履歴(F-24)。作業に紐づく商談がこの商談の訪問を返す。商談の代わりに訪問先の顧客を返す
      .get(
        "/:id/visits",
        validate("param", idParamSchema),
        validate("query", paginationQuerySchema),
        async (c) => {
          const { id } = c.req.valid("param");
          const exists = await db.deal.findUnique({ where: { id }, select: { id: true } });
          if (!exists) throw NOT_FOUND();
          const { visits, pagination } = await findVisitHistory(
            db,
            { dealId: id },
            c.req.valid("query"),
          );
          return c.json({ items: visits.map(toDealVisit), pagination });
        },
      )

      .put(
        "/:id",
        validate("param", idParamSchema),
        validate("json", dealInputSchema),
        async (c) => {
          const { id } = c.req.valid("param");
          const input = c.req.valid("json");
          const deal = await db.deal.findUnique({ where: { id } });
          if (!deal) throw NOT_FOUND();

          if (input.customer_id !== deal.customerId) {
            await assertCustomerExists(input.customer_id);
            // 訪問記録の顧客と食い違うため、訪問記録がある商談の顧客は変えられない(DEAL-06)
            if (await hasVisits(id)) {
              throw new AppError("CONFLICT", "訪問記録がある商談は、顧客を変更できません");
            }
          }
          // 担当者を変えるときだけ確かめる。担当者が後から無効になっても、他の項目は更新できるように
          if (input.owner_id !== deal.ownerId) await assertValidOwner(input.owner_id);

          await db.deal.update({
            where: { id },
            data: {
              customerId: input.customer_id,
              name: input.name,
              ownerId: input.owner_id,
              stage: input.stage,
              amount: input.amount,
              expectedCloseDate: toDbDate(input.expected_close_date),
            },
          });
          return c.json(await findDetail(id));
        },
      )
  );
};
