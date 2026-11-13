import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { Db } from "./db";

// 画面の配信(本番のイメージ)。データベースは使わないルートだけを確かめる
let webDir: string;
// データベースを使うルートは呼ばない
const db = {} as Db;

beforeAll(() => {
  webDir = mkdtempSync(join(tmpdir(), "nippo-web-"));
  writeFileSync(join(webDir, "index.html"), "<!doctype html><title>営業日報</title>");
  writeFileSync(join(webDir, "favicon.svg"), "<svg/>");
  mkdirSync(join(webDir, "assets"));
  writeFileSync(join(webDir, "assets", "index-abc123.js"), "console.log(1)");
});

afterAll(() => rmSync(webDir, { recursive: true, force: true }));

const app = () => createApp({ db, secureCookie: true, webDir });

describe("画面の配信", () => {
  it("/ では index.html を返し、保存しないようにする", async () => {
    const res = await app().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("<title>営業日報</title>");
  });

  it("画面のURL(/reports/12 など)では、画面側のルーティングのため index.html を返す", async () => {
    for (const path of ["/reports/12", "/admin/users/new", "/login?redirect=%2Freports"]) {
      const res = await app().request(path);
      expect(res.status, path).toBe(200);
      expect(await res.text(), path).toContain("<title>営業日報</title>");
    }
  });

  it("/assets/ のファイルは1年保存してよい", async () => {
    const res = await app().request("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("console.log(1)");
  });

  it("/assets/ にないファイルは、index.html ではなく 404", async () => {
    const res = await app().request("/assets/index-old.js");
    expect(res.status).toBe(404);
  });

  it("/assets/ 以外のファイルは、保存しないようにして返す", async () => {
    const res = await app().request("/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("ディレクトリの外のファイルは返さない", async () => {
    const res = await app().request("/..%2F..%2Fetc%2Fpasswd");
    expect(await res.text()).not.toContain("root:");
  });
});

describe("API は今までどおり", () => {
  it("GET /api/v1/health は 200", async () => {
    const res = await app().request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("ログインしていなければ、未定義の API のURLも 401(画面を返さない)", async () => {
    const res = await app().request("/api/v1/no-such-api");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("/api の下の API 以外のURLは 404(画面を返さない)", async () => {
    const res = await app().request("/api/v2/health");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("webDir を指定しなければ、画面を配信しない(開発用)", async () => {
    const res = await createApp({ db, secureCookie: true }).request("/");
    expect(res.status).toBe(404);
  });
});
