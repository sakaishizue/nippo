import { describe, expect, test } from "vitest";
import { createTestApp } from "../testing/auth";
import { seedTestData } from "../testing/fixtures";
import { testDb } from "../testing/test-db";
import { CreateAdminError, createAdmin } from "./create-admin";

const input = { name: "管理 花子", email: "admin@example.com", password: "admin-pass-1" };

const login = (email: string, password: string) =>
  createTestApp().request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("createAdmin", () => {
  test("空のデータベースに管理者を作り、そのパスワードでログインできる", async () => {
    const admin = await createAdmin(testDb, input);
    expect(admin).toEqual({ id: 1, name: "管理 花子", email: "admin@example.com", role: "admin" });

    const res = await login(input.email, input.password);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ role: "admin", manager: null });
  });

  test("パスワードは Argon2id のハッシュ値で保存し、上長は設定しない", async () => {
    await createAdmin(testDb, input);
    const user = await testDb.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(input.password);
    expect(user).toMatchObject({ managerId: null, isActive: true });
  });

  test("氏名の前後の空白は取り除く", async () => {
    const admin = await createAdmin(testDb, { ...input, name: "  管理 花子  " });
    expect(admin.name).toBe("管理 花子");
  });

  test("既に管理者がいても、別のメールアドレスなら追加できる", async () => {
    await seedTestData(testDb);
    await createAdmin(testDb, input);
    expect(await testDb.user.count({ where: { role: "admin" } })).toBe(2);
  });

  test("メールアドレスが重複していればエラーにし、作らない", async () => {
    await seedTestData(testDb);
    const before = await testDb.user.count();
    await expect(createAdmin(testDb, { ...input, email: "u1@example.com" })).rejects.toThrow(
      new CreateAdminError("u1@example.com は既に登録されています"),
    );
    expect(await testDb.user.count()).toBe(before);
  });

  test.each([
    ["パスワードが7文字", { password: "1234567" }, "8文字以上"],
    ["メールアドレスの形式が誤り", { email: "not-an-email" }, "メールアドレスの形式"],
    ["氏名が空", { name: "   " }, "氏名を入力"],
    ["氏名が51文字", { name: "あ".repeat(51) }, "50文字以内"],
  ])("%s はエラーにし、作らない", async (_name, override, message) => {
    await expect(createAdmin(testDb, { ...input, ...override })).rejects.toThrow(message);
    expect(await testDb.user.count()).toBe(0);
  });
});
