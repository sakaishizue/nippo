import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

/** Zod のエラーの位置を `work_entries[0].minutes` の形式にする */
export const toFieldPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((field, key) => {
    if (typeof key === "number") return `${field}[${key}]`;
    const name = String(key);
    return field === "" ? name : `${field}.${name}`;
  }, "");

/** 入力チェックの失敗を `422 VALIDATION_ERROR` にする zValidator */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", "入力内容に誤りがあります", {
        details: result.error.issues.map((issue) => ({
          field: toFieldPath(issue.path),
          message: issue.message,
        })),
      });
    }
  });
