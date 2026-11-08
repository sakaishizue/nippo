/** 分を「7時間30分」の形式にする(画面定義書 SCR-03、SCR-07) */
export const formatMinutes = (minutes: number): string => {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`minutes must be a non-negative integer: ${minutes}`);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
};
