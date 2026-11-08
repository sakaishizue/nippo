import { hash, verify } from "@node-rs/argon2";

// argon2id、メモリ19MiB、2回(OWASP の推奨値で、@node-rs/argon2 の既定値)
export const hashPassword = (password: string): Promise<string> => hash(password);

/** パスワードがハッシュ値と一致するか。ハッシュ値の形式が不正な場合も false を返す */
export const verifyPassword = async (hashed: string, password: string): Promise<boolean> => {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
};

let dummyHash: Promise<string> | undefined;

/**
 * ユーザーが見つからないときにも、照合と同じだけ時間をかける。
 * 応答時間の差から、メールアドレスが登録されているかを推測されないようにするため。常に false を返す
 */
export const verifyAgainstDummy = async (password: string): Promise<false> => {
  dummyHash ??= hashPassword("dummy-password-for-constant-time");
  await verifyPassword(await dummyHash, password);
  return false;
};
