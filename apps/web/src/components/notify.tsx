import type { CSSProperties } from "react";
import { Toaster, toast } from "sonner";

// 完了などのメッセージを画面上部に数秒表示する(画面定義書 3.3)
const DURATION_MS = 4000;

// sonner の色を、テーマの完了、警告、エラーの色にする(画面定義書 3.5)
const toasterStyle = {
  "--success-bg": "var(--success-surface)",
  "--success-text": "var(--success)",
  "--success-border": "var(--success-outline)",
  "--warning-bg": "var(--warning-surface)",
  "--warning-text": "var(--warning)",
  "--warning-border": "var(--warning-outline)",
  "--error-bg": "var(--destructive-surface)",
  "--error-text": "var(--destructive)",
  "--error-border": "var(--destructive-outline)",
} as CSSProperties;

/** メッセージの表示場所。アプリに1つだけ置く */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      duration={DURATION_MS}
      richColors
      style={toasterStyle}
      toastOptions={{ className: "font-sans text-sm" }}
    />
  );
}

/** 完了メッセージ(例: 「日報を提出しました」) */
export const notifySuccess = (message: string) => toast.success(message);

/** 画面全体に関わるエラー(項目のエラーは項目の下に表示する) */
export const notifyError = (message: string) => toast.error(message);
