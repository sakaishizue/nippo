import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// テスト仕様書のケースIDが、テストのコードに書かれているかを確かめる(テスト仕様書 NFR-09)。
// 4章(APIテスト)は API を直接呼ぶテスト(apps/api/src)、5章(画面テスト)は e2e/ に、ケースIDを書いておく。
// 仕様書にケースを足してテストを書き忘れると、ここで失敗する

const root = fileURLToPath(new URL("../../../", import.meta.url));
const spec = readFileSync(join(root, "docs/test-spec.md"), "utf8");

/** 仕様書の表の行の先頭にあるケースID */
const caseIds = (pattern: string) =>
  [...spec.matchAll(new RegExp(`^\\| ((?:${pattern})-\\d+) `, "gm"))].map(
    (match) => match[1] ?? "",
  );

/** フォルダの下の、名前が条件に合うファイルの内容をまとめて返す */
const sourcesUnder = (dir: string, accept: (name: string) => boolean): string =>
  readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => accept(name) && !name.includes("node_modules"))
    .map((name) => readFileSync(join(root, dir, name), "utf8"))
    .join("\n");

const apiTests = sourcesUnder("apps/api/src", (name) => name.endsWith(".test.ts"));
const e2eTests = sourcesUnder("e2e", (name) => name.endsWith(".spec.ts"));

const missingIn = (ids: string[], sources: string) =>
  ids.filter((id) => !new RegExp(`\\b${id}\\b`).test(sources));

describe("テスト仕様書のケースとテストの対応", () => {
  it("4章の API テストのケースは、すべて API テストにある", () => {
    const ids = caseIds("AUTH|RPT|SUB|REV|CMT|VIEW|SUM|CUS|DEAL|NTF|RMD|USR|CAL");
    expect(ids.length).toBeGreaterThan(100);
    expect(missingIn(ids, apiTests)).toEqual([]);
  });

  it("5章の画面テストのケースは、すべて画面テストにある", () => {
    const ids = caseIds("E2E");
    expect(ids).toHaveLength(20);
    expect(missingIn(ids, e2eTests)).toEqual([]);
  });

  it("自動で確かめる非機能テスト(NFR-01〜03、07、09、10)は、テストにある", () => {
    const ids = ["NFR-01", "NFR-02", "NFR-03", "NFR-07", "NFR-09", "NFR-10"];
    expect(ids.every((id) => caseIds("NFR").includes(id))).toBe(true);
    expect(missingIn(ids, `${apiTests}\n${e2eTests}`)).toEqual([]);
  });
});
