import { describe, expect, it } from "vitest";
import { pageFrom, pageRange, searchFor, searchWithPage } from "./list-query";

describe("pageFrom", () => {
  it.each([
    ["", 1],
    ["page=3", 3],
    ["page=0", 1],
    ["page=-2", 1],
    ["page=1.5", 1],
    ["page=abc", 1],
  ])("%s は %i ページ目", (query, page) => {
    expect(pageFrom(new URLSearchParams(query))).toBe(page);
  });
});

describe("pageRange", () => {
  it("1ページ20件で、表示中の範囲と前後のページの有無を返す", () => {
    expect(pageRange(1, 20, 45)).toEqual({
      from: 1,
      to: 20,
      lastPage: 3,
      hasPrev: false,
      hasNext: true,
    });
    expect(pageRange(3, 20, 45)).toEqual({
      from: 41,
      to: 45,
      lastPage: 3,
      hasPrev: true,
      hasNext: false,
    });
  });

  it("0件は 0〜0件で、ページは1つ", () => {
    expect(pageRange(1, 20, 0)).toEqual({
      from: 0,
      to: 0,
      lastPage: 1,
      hasPrev: false,
      hasNext: false,
    });
  });

  it("ちょうど20件は1ページ", () => {
    expect(pageRange(1, 20, 20)).toMatchObject({ to: 20, lastPage: 1, hasNext: false });
  });
});

describe("searchWithPage", () => {
  const params = new URLSearchParams("status=submitted&status=returned&q=提案&page=2");

  it("検索条件を残して、ページだけを変える", () => {
    expect(searchWithPage(params, 3)).toBe(
      "?status=submitted&status=returned&q=%E6%8F%90%E6%A1%88&page=3",
    );
  });

  it("1ページ目は page を付けない", () => {
    expect(searchWithPage(params, 1)).toBe(
      "?status=submitted&status=returned&q=%E6%8F%90%E6%A1%88",
    );
    expect(searchWithPage(new URLSearchParams("page=2"), 1)).toBe("");
  });
});

describe("searchFor", () => {
  it("検索条件をクエリにし、page は付けない(1ページ目に戻す)", () => {
    expect(
      searchFor({ from: "2026-11-01", status: ["draft", "approved"], user_id: null, page: 4 }),
    ).toBe("?from=2026-11-01&status=draft&status=approved");
  });
});
