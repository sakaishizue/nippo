// API の中では new Date() ではなく now() を使う。テストで「今日」や経過時間を再現できるようにするため
let fixed: Date | null = null;

/** 現在日時。setNow() で固定されていれば、その日時を返す */
export const now = (): Date => (fixed ? new Date(fixed) : new Date());

/** 現在日時を固定する。null を渡すと元に戻す(テスト用) */
export const setNow = (date: Date | null): void => {
  fixed = date ? new Date(date) : null;
};
