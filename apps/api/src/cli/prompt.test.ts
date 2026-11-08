import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { createHiddenPrompt } from "./prompt";

// 端末の代わりに、入力と出力をストリームで用意する
const setup = () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let screen = "";
  output.on("data", (chunk) => {
    screen += chunk.toString();
  });
  const prompt = createHiddenPrompt({ input, output });
  return { input, prompt, screen: () => screen };
};

let close: (() => void) | undefined;
afterEach(() => close?.());

const type = (input: PassThrough, ...chunks: string[]) => {
  for (const chunk of chunks) input.write(chunk);
};

describe("createHiddenPrompt", () => {
  test("入力した文字を画面に表示しない", async () => {
    const { input, prompt, screen } = setup();
    close = prompt.close;
    const answer = prompt.ask("パスワード: ");
    type(input, "secret12\r");
    expect(await answer).toBe("secret12");
    expect(screen()).toContain("パスワード: ");
    expect(screen()).not.toContain("secret12");
  });

  test("Windows の改行(\\r\\n)が別々に届いても、次の質問が空にならない", async () => {
    const { input, prompt } = setup();
    close = prompt.close;
    const first = prompt.ask("1回目: ");
    type(input, "password1\r");
    expect(await first).toBe("password1");

    const second = prompt.ask("2回目: ");
    // 1回目の Enter の \n が、少し遅れて届く
    type(input, "\n", "password1\r");
    expect(await second).toBe("password1");
  });

  test("\\r\\n が一度に届いても1回の改行として扱う", async () => {
    const { input, prompt } = setup();
    close = prompt.close;
    const first = prompt.ask("1回目: ");
    type(input, "password1\r\n");
    expect(await first).toBe("password1");
    const second = prompt.ask("2回目: ");
    type(input, "password2\r\n");
    expect(await second).toBe("password2");
  });

  test.each([
    ["DEL(\\x7f)", "\x7f"],
    ["BS(\\b)", "\b"],
  ])("Backspace(%s)で直前の文字を消せる", async (_name, backspace) => {
    const { input, prompt } = setup();
    close = prompt.close;
    const answer = prompt.ask("パスワード: ");
    type(input, "password1x", backspace, "\r");
    expect(await answer).toBe("password1");
  });

  test("Ctrl+C で中断する", async () => {
    const { input, prompt } = setup();
    close = prompt.close;
    const answer = prompt.ask("パスワード: ");
    type(input, "pass", "\x03");
    await expect(answer).rejects.toThrow("中断しました");
  });
});
