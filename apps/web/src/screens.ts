// 画面定義書 1章の画面とURLの対応。中身は各画面のIssueで作る
export type Screen = {
  id: string;
  name: string;
  path: string;
};

export const SCREENS = [
  { id: "SCR-01", name: "ログイン", path: "/login" },
  { id: "SCR-02", name: "ホーム", path: "/" },
  { id: "SCR-03", name: "日報一覧", path: "/reports" },
  { id: "SCR-04", name: "日報入力", path: "/reports/new" },
  { id: "SCR-04", name: "日報入力", path: "/reports/:id/edit" },
  { id: "SCR-05", name: "日報詳細", path: "/reports/:id" },
  { id: "SCR-06", name: "承認待ち一覧", path: "/approvals" },
  { id: "SCR-07", name: "作業時間集計", path: "/summary" },
  { id: "SCR-08", name: "顧客一覧", path: "/customers" },
  { id: "SCR-10", name: "顧客登録", path: "/customers/new" },
  { id: "SCR-09", name: "顧客詳細", path: "/customers/:id" },
  { id: "SCR-10", name: "顧客編集", path: "/customers/:id/edit" },
  { id: "SCR-11", name: "商談一覧", path: "/deals" },
  { id: "SCR-13", name: "商談登録", path: "/deals/new" },
  { id: "SCR-12", name: "商談詳細", path: "/deals/:id" },
  { id: "SCR-13", name: "商談編集", path: "/deals/:id/edit" },
  { id: "SCR-14", name: "通知一覧", path: "/notifications" },
  { id: "SCR-15", name: "ユーザー一覧", path: "/admin/users" },
  { id: "SCR-16", name: "ユーザー登録", path: "/admin/users/new" },
  { id: "SCR-16", name: "ユーザー編集", path: "/admin/users/:id" },
  { id: "SCR-17", name: "プロフィール", path: "/profile" },
] as const satisfies readonly Screen[];
