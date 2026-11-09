import { useEffect, useState } from "react";

/** 値が変わってから delayMs のあいだ変わらなければ、その値を返す(入力のたびに API を呼ばないように) */
export const useDebouncedValue = <T>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};
