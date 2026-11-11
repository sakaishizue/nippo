import type { Role } from "@nippo/shared";

// 画面定義書 1章の画面とURLの対応と、使えるロール。中身は各画面のIssueで作る
export type Screen = {
  id: string;
  name: string;
  path: string;
  /** ログインせずに開ける画面 */
  public?: boolean;
  /** 使えるロール。省略した場合は、ログインしていれば全員が使える */
  roles?: readonly Role[];
};

const MEMBER = ["member"] as const;
const MANAGER = ["manager"] as const;
const ADMIN = ["admin"] as const;
const MEMBER_MANAGER = ["member", "manager"] as const;

export const SCREENS = [
  { id: "SCR-01", name: "ログイン", path: "/login", public: true },
  // 管理者はホームを使わないが、開いたときはユーザー一覧へ移動する(画面の中で移動する)
  { id: "SCR-02", name: "ホーム", path: "/" },
  { id: "SCR-03", name: "日報一覧", path: "/reports" },
  { id: "SCR-04", name: "日報入力", path: "/reports/new", roles: MEMBER },
  { id: "SCR-04", name: "日報入力", path: "/reports/:id/edit", roles: MEMBER },
  { id: "SCR-05", name: "日報詳細", path: "/reports/:id" },
  { id: "SCR-06", name: "承認待ち一覧", path: "/approvals", roles: MANAGER },
  { id: "SCR-07", name: "作業時間集計", path: "/summary", roles: MEMBER_MANAGER },
  { id: "SCR-08", name: "顧客一覧", path: "/customers" },
  { id: "SCR-10", name: "顧客登録", path: "/customers/new" },
  { id: "SCR-09", name: "顧客詳細", path: "/customers/:id" },
  { id: "SCR-10", name: "顧客編集", path: "/customers/:id/edit" },
  { id: "SCR-11", name: "商談一覧", path: "/deals" },
  { id: "SCR-13", name: "商談登録", path: "/deals/new" },
  { id: "SCR-12", name: "商談詳細", path: "/deals/:id" },
  { id: "SCR-13", name: "商談編集", path: "/deals/:id/edit" },
  { id: "SCR-14", name: "通知一覧", path: "/notifications", roles: MEMBER_MANAGER },
  { id: "SCR-15", name: "ユーザー一覧", path: "/admin/users", roles: ADMIN },
  { id: "SCR-16", name: "ユーザー登録", path: "/admin/users/new", roles: ADMIN },
  { id: "SCR-16", name: "ユーザー編集", path: "/admin/users/:id", roles: ADMIN },
  { id: "SCR-17", name: "プロフィール", path: "/profile" },
] as const satisfies readonly Screen[];
