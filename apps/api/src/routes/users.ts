import {
  createUserSchema,
  MANAGER_NOT_ALLOWED_MESSAGE,
  MANAGER_REQUIRED_MESSAGE,
  type UserDetailResponse,
  type UserResponse,
  updateUserSchema,
  userListQuerySchema,
  userOptionsQuerySchema,
} from "@nippo/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Prisma, User } from "../../generated/prisma/client";
import { type AuthEnv, requireRole } from "../auth/middleware";
import { hashPassword } from "../auth/password";
import type { Db } from "../db";
import { AppError } from "../errors";
import { validate } from "../validator";

type Options = { db: Db };

const withManager = { manager: { select: { id: true, name: true } } } as const;
type UserWithManager = User & { manager: { id: number; name: string } | null };

const toUserResponse = (user: UserWithManager): UserResponse => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  manager: user.manager,
  is_active: user.isActive,
});

const fieldError = (field: string, message: string) =>
  new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", { details: [{ field, message }] });

const EMAIL_TAKEN = "このメールアドレスは既に登録されています";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** ユーザー管理API(API仕様書 10章)。管理者のみ */
export const usersRoutes = ({ db }: Options) => {
  const findDetail = async (id: number): Promise<UserDetailResponse | null> => {
    const user = await db.user.findUnique({ where: { id }, include: withManager });
    if (!user) return null;
    const report = await db.dailyReport.findFirst({ where: { userId: id }, select: { id: true } });
    return { ...toUserResponse(user), has_reports: report !== null };
  };

  /** 上長に選べるのは、有効な上長のユーザーだけ */
  const assertValidManager = async (managerId: number, userId?: number) => {
    const manager = await db.user.findUnique({ where: { id: managerId } });
    if (manager?.role !== "manager" || !manager.isActive || manager.id === userId) {
      throw fieldError("manager_id", "有効な上長を選んでください");
    }
  };

  const assertEmailAvailable = async (email: string, userId?: number) => {
    const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== userId) throw fieldError("email", EMAIL_TAKEN);
  };

  return new Hono<AuthEnv>()
    .use(requireRole("admin"))

    .get("/", validate("query", userListQuerySchema), async (c) => {
      const { q, role, is_active, page, per_page } = c.req.valid("query");
      const where: Prisma.UserWhereInput = {
        isActive: is_active,
        ...(role && { role }),
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }),
      };
      const [users, total] = await db.$transaction([
        db.user.findMany({
          where,
          include: withManager,
          orderBy: { id: "asc" },
          skip: (page - 1) * per_page,
          take: per_page,
        }),
        db.user.count({ where }),
      ]);
      return c.json({ items: users.map(toUserResponse), pagination: { page, per_page, total } });
    })

    .post("/", validate("json", createUserSchema), async (c) => {
      const input = c.req.valid("json");
      if (input.manager_id !== null) await assertValidManager(input.manager_id);
      await assertEmailAvailable(input.email);
      let id: number;
      try {
        ({ id } = await db.user.create({
          data: {
            name: input.name,
            email: input.email,
            role: input.role,
            managerId: input.manager_id,
            passwordHash: await hashPassword(input.password),
            isActive: input.is_active,
          },
          select: { id: true },
        }));
      } catch (error) {
        // 確認してから作るまでの間に、同じメールアドレスで登録された場合
        if (isUniqueViolation(error)) throw fieldError("email", EMAIL_TAKEN);
        throw error;
      }
      return c.json(await findDetail(id), 201);
    })

    .get("/:id", validate("param", idParamSchema), async (c) => {
      const detail = await findDetail(c.req.valid("param").id);
      if (!detail) throw new AppError("NOT_FOUND", "ユーザーが見つかりません");
      return c.json(detail);
    })

    .patch(
      "/:id",
      validate("param", idParamSchema),
      validate("json", updateUserSchema),
      async (c) => {
        const { id } = c.req.valid("param");
        const input = c.req.valid("json");
        const user = await db.user.findUnique({ where: { id } });
        if (!user) throw new AppError("NOT_FOUND", "ユーザーが見つかりません");

        const roleChanged = input.role !== undefined && input.role !== user.role;
        const deactivating = input.is_active === false && user.isActive;

        if (user.id === c.var.user.id && (roleChanged || deactivating)) {
          throw new AppError("CONFLICT", "自分自身のロールの変更と無効化はできません");
        }
        if (user.role === "manager" && (roleChanged || deactivating)) {
          const activeSubordinates = await db.user.count({
            where: { managerId: user.id, isActive: true },
          });
          if (activeSubordinates > 0) {
            throw new AppError(
              "CONFLICT",
              "有効な部下がいる上長は、ロールの変更と無効化ができません。先に部下の上長を変更してください",
            );
          }
        }

        // ロールと上長の組み合わせは、今の値と合わせて確かめる。一般以外に変えたら上長は外す
        const role = input.role ?? user.role;
        let managerId = input.manager_id !== undefined ? input.manager_id : user.managerId;
        if (role !== "member") {
          if (input.manager_id != null) throw fieldError("manager_id", MANAGER_NOT_ALLOWED_MESSAGE);
          managerId = null;
        } else if (managerId === null) {
          throw fieldError("manager_id", MANAGER_REQUIRED_MESSAGE);
        } else if (input.manager_id !== undefined || roleChanged) {
          await assertValidManager(managerId, user.id);
        }
        if (input.email !== undefined) await assertEmailAvailable(input.email, user.id);

        const data: Prisma.UserUncheckedUpdateInput = {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.email !== undefined && { email: input.email }),
          ...(input.is_active !== undefined && { isActive: input.is_active }),
          role,
          managerId,
          ...(input.password !== undefined && {
            passwordHash: await hashPassword(input.password),
          }),
        };
        // パスワードを再設定したとき(漏れていた場合に締め出すため)と、無効化したときは、セッションをすべて削除する
        const revokeSessions = input.password !== undefined || deactivating;
        try {
          await db.$transaction([
            db.user.update({ where: { id }, data }),
            ...(revokeSessions ? [db.session.deleteMany({ where: { userId: id } })] : []),
          ]);
        } catch (error) {
          if (isUniqueViolation(error)) throw fieldError("email", EMAIL_TAKEN);
          throw error;
        }
        return c.json(await findDetail(id));
      },
    );
};

/** GET /user-options。選択肢に使う有効なユーザーのIDと氏名。全員が使える */
export const userOptionsRoutes = ({ db }: Options) =>
  new Hono<AuthEnv>().get("/", validate("query", userOptionsQuerySchema), async (c) => {
    const { role } = c.req.valid("query");
    const items = await db.user.findMany({
      where: { role, isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    return c.json({ items });
  });
