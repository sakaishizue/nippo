import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

type Streams = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

/**
 * 入力した文字を画面に表示せずに読むプロンプト(パスワード用)。
 * 入力の処理(改行、Backspace、Ctrl+C)は readline に任せ、画面への表示だけを止める。
 * Windows の端末は Enter で \r と \n を別々に送ることがあるが、readline はこれを1つの改行として扱う
 */
export const createHiddenPrompt = ({
  input = process.stdin,
  output = process.stdout,
}: Streams = {}) => {
  let muted = false;
  // readline が画面に書き込む内容(入力した文字の表示)を、入力中だけ捨てる
  const screen = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input, output: screen, terminal: true, historySize: 0 });

  let interrupt: (() => void) | undefined;
  rl.on("SIGINT", () => interrupt?.());

  const ask = async (question: string): Promise<string> => {
    output.write(question);
    muted = true;
    try {
      return await new Promise<string>((resolve, reject) => {
        interrupt = () => reject(new Error("中断しました"));
        rl.question("").then(resolve, reject);
      });
    } finally {
      muted = false;
      interrupt = undefined;
      output.write("\n");
    }
  };

  // 閉じると、端末の表示の設定(raw モード)も元に戻る
  return { ask, close: () => rl.close() };
};
