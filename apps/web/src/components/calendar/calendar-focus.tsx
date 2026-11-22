import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

// 画面とカレンダーの連動(画面定義書 3.1)。開いている画面の日付(日報の日付など)を、カレンダーで選択中にする

const FocusDateContext = createContext<string | null>(null);
const SetFocusDateContext = createContext<(date: string | null) => void>(() => {});

/** AppLayout に置き、カレンダーと画面の間で選択中の日付を受け渡す */
export function CalendarFocusProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState<string | null>(null);
  return (
    <SetFocusDateContext.Provider value={setDate}>
      <FocusDateContext.Provider value={date}>{children}</FocusDateContext.Provider>
    </SetFocusDateContext.Provider>
  );
}

/** カレンダーで選択中にする日付 */
export const useCalendarFocusDate = () => useContext(FocusDateContext);

/**
 * 画面の日付をカレンダーで選択中にする。画面を離れると選択を外す。
 * 日付の形式が `YYYY-MM-DD` でないとき(入力の途中など)は選択しない
 */
export const useCalendarFocus = (date: string | null | undefined) => {
  const setDate = useContext(SetFocusDateContext);
  const valid = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  useEffect(() => {
    setDate(valid);
    return () => setDate(null);
  }, [valid, setDate]);
};
