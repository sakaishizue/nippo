import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * 未保存の入力があるときに、画面を離れる前に警告する(画面定義書 SCR-04)。
 * 画面内の移動は確認ダイアログ、タブを閉じる・再読み込みはブラウザの警告を出す。
 * 保存した後の移動など、警告しない移動の前には allowLeave() を呼ぶ
 */
export const useUnsavedChanges = (dirty: boolean) => {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const allowed = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowed.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const allowLeave = useCallback(() => {
    allowed.current = true;
  }, []);

  const dialog = (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => {
        if (!open && blocker.state === "blocked") blocker.reset();
      }}
      title="保存していない入力があります。この画面を離れますか?"
      description="離れると、入力した内容は失われます。"
      confirmLabel="離れる"
      onConfirm={() => blocker.proceed?.()}
      destructive
    />
  );

  return { allowLeave, dialog };
};
