import { describe, expect, test } from "vitest";
import { CreateAdminError } from "../admin/create-admin";
import { parseCreateAdminArgs } from "./create-admin-args";

describe("parseCreateAdminArgs", () => {
  test("--name と --email を読む", () => {
    expect(parseCreateAdminArgs(["--name", "管理 太郎", "--email", "admin@example.com"])).toEqual({
      name: "管理 太郎",
      email: "admin@example.com",
    });
  });

  test("--password は受け付けない(シェルの履歴に残さないため)", () => {
    expect(() =>
      parseCreateAdminArgs(["--name", "管理", "--email", "a@example.com", "--password", "x"]),
    ).toThrow(/パスワードは引数では指定できません/);
  });

  test.each([[["--email", "a@example.com"]], [["--name", "管理"]], [[]]])(
    "必須の引数がなければ使い方を示す: %j",
    (args) => {
      expect(() => parseCreateAdminArgs(args)).toThrow(/使い方: create-admin/);
    },
  );

  test("余分な引数はエラー", () => {
    expect(() =>
      parseCreateAdminArgs(["--name", "管理", "--email", "a@example.com", "extra"]),
    ).toThrow(CreateAdminError);
  });
});
