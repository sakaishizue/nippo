/** ログイン画面のURLと、ログイン後に戻る画面を渡すクエリの名前 */
export const LOGIN_PATH = "/login";
export const REDIRECT_PARAM = "redirect";

type Location = { pathname: string; search?: string; hash?: string };

/** 今の画面に戻れるよう、元のURLをクエリに付けたログイン画面のURLを返す */
export const loginPathFor = (location: Location): string => {
  const from = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
  if (location.pathname === LOGIN_PATH || from === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?${new URLSearchParams({ [REDIRECT_PARAM]: from })}`;
};

/**
 * ログイン後に戻る画面のURLを、クエリの値から取り出す。
 * 他のサイトへ移動させられないよう、`/` で始まるこのサイト内のパスだけを受け付け、それ以外は null を返す
 */
export const safeRedirectPath = (value: string | null | undefined): string | null => {
  if (!value?.startsWith("/")) return null;
  // `//example.com` や `/\example.com` は、ブラウザが他のサイトとして扱う
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // 制御文字(改行やタブ)は URL の解釈で取り除かれ、`/\t/example.com` が `//example.com` になる
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を拒否するため
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost" || url.pathname === LOGIN_PATH) return null;
  return `${url.pathname}${url.search}${url.hash}`;
};
