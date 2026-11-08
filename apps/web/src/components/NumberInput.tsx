import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 数値の入力欄。スマートフォンで数字キーボードを表示する(画面定義書 3.2、NFR-03)。
 * type="number" はスクロールで値が変わり、空と不正な値を区別できないため、文字列の入力欄にする
 */
export function NumberInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className={cn("text-right", className)}
      {...props}
    />
  );
}
