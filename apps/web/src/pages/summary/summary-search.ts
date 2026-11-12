import { type Role, type SummaryGroup, summaryGroupSchema } from "@nippo/shared";

// SCR-07 作業時間集計の条件。URL のクエリに持つ(画面定義書 3.4)

/** `YYYY-MM-DD` の月の初日と末日(期間の初期値は今月) */
export const monthRange = (date: string) => {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const month = String(m).padStart(2, "0");
  return { from: `${y}-${month}-01`, to: `${y}-${month}-${String(last).padStart(2, "0")}` };
};

/** 選べる集計の切り口。一般は自分の日報だけのため「担当者別」を出さない */
export const groupOptions = (role: Role): readonly SummaryGroup[] =>
  role === "member" ? ["category", "customer", "deal"] : ["user", "category", "customer", "deal"];

/** 切り口の初期値。上長は部下ごと、一般は作業区分ごと */
export const defaultGroup = (role: Role): SummaryGroup => (role === "member" ? "category" : "user");

export type SummarySearch = {
  from: string;
  to: string;
  groupBy: SummaryGroup;
  /** 上長が選んだ部下。空なら全員 */
  userIds: number[];
};

/** URL のクエリから条件を読む。ないもの、不正なものは初期値にする */
export const summarySearchFrom = (
  searchParams: URLSearchParams,
  role: Role,
  today: string,
): SummarySearch => {
  const month = monthRange(today);
  const group = summaryGroupSchema.safeParse(searchParams.get("group_by"));
  const groupBy =
    group.success && groupOptions(role).includes(group.data) ? group.data : defaultGroup(role);
  return {
    from: searchParams.get("from") || month.from,
    to: searchParams.get("to") || month.to,
    groupBy,
    userIds:
      role === "manager"
        ? searchParams
            .getAll("user_id")
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
        : [],
  };
};

/** 条件を URL のクエリにする。初期値と同じ項目は入れない。部下を全員選んだ場合は指定なしにする */
export const summarySearchQuery = (
  search: SummarySearch,
  role: Role,
  today: string,
  allUserIds: number[],
) => {
  const month = monthRange(today);
  const allSelected =
    search.userIds.length === 0 || allUserIds.every((id) => search.userIds.includes(id));
  return {
    from: search.from === month.from ? null : search.from,
    to: search.to === month.to ? null : search.to,
    group_by: search.groupBy === defaultGroup(role) ? null : search.groupBy,
    user_id: allSelected ? [] : search.userIds,
  };
};
