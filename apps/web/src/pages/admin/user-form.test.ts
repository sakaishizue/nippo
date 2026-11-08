import type { UserDetailResponse } from "@nippo/shared";
import { describe, expect, it } from "vitest";
import {
  needsRoleChangeConfirmation,
  toUserRequest,
  type UserFormInput,
  userFormDefaults,
  userFormSchema,
} from "./user-form";

const member: UserDetailResponse = {
  id: 12,
  name: "山田 太郎",
  email: "u1@example.com",
  role: "member",
  manager: { id: 3, name: "鈴木 一郎" },
  is_active: true,
  has_reports: true,
};

const input = (overrides: Partial<UserFormInput> = {}): UserFormInput => ({
  name: "山田 太郎",
  email: "u1@example.com",
  role: "member",
  manager_id: "3",
  password: "password123",
  is_active: "true",
  ...overrides,
});

const issuesOf = (mode: "create" | "edit", values: UserFormInput) => {
  const result = userFormSchema(mode).safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((issue) => [issue.path.join("."), issue.message]);
};

describe("userFormSchema", () => {
  it("正しい入力は通る", () => {
    expect(issuesOf("create", input())).toEqual([]);
  });

  it("一般で上長が未選択ならエラー、一般以外なら上長は不要", () => {
    expect(issuesOf("create", input({ manager_id: "" }))).toEqual([
      ["manager_id", "一般のユーザーには上長を選んでください"],
    ]);
    expect(issuesOf("create", input({ role: "manager", manager_id: "" }))).toEqual([]);
  });

  it("登録ではパスワードが必須", () => {
    expect(issuesOf("create", input({ password: "" }))).toEqual([
      ["password", "パスワードを入力してください"],
    ]);
  });

  it("編集ではパスワードは空でよく、入力したら8文字以上", () => {
    expect(issuesOf("edit", input({ password: "" }))).toEqual([]);
    expect(issuesOf("edit", input({ password: "1234567" }))).toEqual([
      ["password", "8文字以上で入力してください"],
    ]);
  });

  it("氏名とメールアドレスを確かめる", () => {
    expect(issuesOf("create", input({ name: "  ", email: "not-email" })).map(([f]) => f)).toEqual([
      "name",
      "email",
    ]);
  });
});

describe("userFormDefaults", () => {
  it("登録は、有効な一般で空の入力", () => {
    expect(userFormDefaults()).toEqual({
      name: "",
      email: "",
      role: "member",
      manager_id: "",
      password: "",
      is_active: "true",
    });
  });

  it("編集は今の値で、パスワードは空", () => {
    expect(userFormDefaults({ ...member, is_active: false })).toEqual({
      name: "山田 太郎",
      email: "u1@example.com",
      role: "member",
      manager_id: "3",
      password: "",
      is_active: "false",
    });
  });
});

describe("toUserRequest", () => {
  const parse = (mode: "create" | "edit", values: UserFormInput) =>
    userFormSchema(mode).parse(values);

  it("一般は上長のIDを数値で送る", () => {
    expect(toUserRequest(parse("create", input({ name: " 山田 太郎 " })))).toEqual({
      name: "山田 太郎",
      email: "u1@example.com",
      role: "member",
      manager_id: 3,
      is_active: true,
      password: "password123",
    });
  });

  it("一般以外は上長を null にする(選んであっても送らない)", () => {
    expect(toUserRequest(parse("create", input({ role: "admin" })))).toMatchObject({
      role: "admin",
      manager_id: null,
    });
  });

  it("パスワードが空なら送らない(編集で再設定しない)", () => {
    expect(toUserRequest(parse("edit", input({ password: "", is_active: "false" })))).toEqual({
      name: "山田 太郎",
      email: "u1@example.com",
      role: "member",
      manager_id: 3,
      is_active: false,
    });
  });
});

describe("needsRoleChangeConfirmation", () => {
  it("日報が残っている一般のロールを変えるときだけ確認する", () => {
    expect(needsRoleChangeConfirmation(member, "manager")).toBe(true);
    expect(needsRoleChangeConfirmation(member, "member")).toBe(false);
    expect(needsRoleChangeConfirmation({ ...member, has_reports: false }, "manager")).toBe(false);
    expect(needsRoleChangeConfirmation({ ...member, role: "manager" }, "admin")).toBe(false);
    expect(needsRoleChangeConfirmation(undefined, "admin")).toBe(false);
  });
});
