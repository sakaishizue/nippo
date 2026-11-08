import type { Session, User } from "../generated/prisma/client";
import type { Db } from "./db";

/** GET /me と POST /auth/login で返す、ログイン中のユーザーの情報(API仕様書 3章) */
export const buildMeResponse = async (db: Db, user: User, session: Session) => {
  const [manager, unreadNotificationCount] = await Promise.all([
    user.managerId
      ? db.user.findUnique({ where: { id: user.managerId }, select: { id: true, name: true } })
      : null,
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    // 上長は一般のみ。上長と管理者は null
    manager: user.role === "member" ? manager : null,
    unread_notification_count: unreadNotificationCount,
    csrf_token: session.csrfToken,
  };
};
