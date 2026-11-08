import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// globals.css のテーマ変数の組み合わせが、WCAG AA のコントラスト比を満たすことを確認する(画面定義書 3.5)
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** :root の `--name: #rrggbb;` を読む */
const readTokens = (source: string): Map<string, string> => {
  const root = source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  return new Map(
    [...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [
      name as string,
      (hex as string).toLowerCase(),
    ]),
  );
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.x のコントラスト比 */
const contrastRatio = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

const tokens = readTokens(css);
const token = (name: string): string => {
  const value = tokens.get(name);
  if (!value) throw new Error(`globals.css の :root に --${name} がありません`);
  return value;
};

// 文字と背景(本文の基準 4.5:1)
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["secondary-foreground", "secondary"],
  ["primary", "card"],
  ["primary-foreground", "primary"],
  ["accent-foreground", "accent"],
  ["destructive", "card"],
  ["destructive", "destructive-surface"],
  ["success", "success-surface"],
  ["warning", "warning-surface"],
  ["header-foreground", "header"],
  ["header-foreground", "header-active"],
  ["status-draft-foreground", "status-draft"],
  ["status-submitted-foreground", "status-submitted"],
  ["status-returned-foreground", "status-returned"],
  ["status-approved-foreground", "status-approved"],
];

// 入力欄の枠やフォーカスの輪など、文字以外の部品(WCAG 1.4.11 の 3:1)
const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["input", "card"],
  ["input", "background"],
  ["ring", "card"],
  ["header-border", "header"],
];

describe("contrastRatio", () => {
  it("白と黒は 21:1、同じ色は 1:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#4338ca", "#4338ca")).toBe(1);
  });
});

describe("テーマの配色", () => {
  it.each(TEXT_PAIRS)("--%s と --%s は 4.5:1 以上", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("--%s と --%s は 3:1 以上", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it("ステータスの背景どうしは同じ色にしない", () => {
    const backgrounds = ["draft", "submitted", "returned", "approved"].map((s) =>
      token(`status-${s}`),
    );
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });
});
