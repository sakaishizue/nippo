import { zodResolver } from "@hookform/resolvers/zod";
import {
  COMMENT_BODY_MAX_LENGTH,
  type CommentInput,
  commentInputSchema,
  RETURN_REASON_MAX_LENGTH,
  type ReportComment,
  type ReportDetail,
  type ReturnInput,
  reportCommentSchema,
  reportDetailSchema,
  returnInputSchema,
} from "@nippo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Undo2Icon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { notifyError, notifySuccess } from "@/components/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";

/** 日報詳細の問い合わせのキー(ReportDetailPage と同じ) */
const detailKey = (id: number) => ["reports", "detail", id] as const;

/**
 * 操作が失敗したときの共通の扱い。他の操作で先に処理されていた(409)、または見られなくなった(404)場合は、
 * メッセージを出して最新の状態を読み直す。それ以外は失敗のメッセージだけ
 */
const useOperationError = (reportId: number) => {
  const queryClient = useQueryClient();
  return (error: unknown) => {
    if (isApiError(error) && (error.status === 409 || error.status === 404)) {
      notifyError(`${error.message}。最新の状態を表示します`);
      void queryClient.invalidateQueries({ queryKey: detailKey(reportId) });
      return;
    }
    notifyError("処理できませんでした。時間をおいてやり直してください");
  };
};

/** 日報の状態が変わったときに、詳細、一覧、ホームを最新にする */
const useApplyReport = () => {
  const queryClient = useQueryClient();
  return async (report: ReportDetail) => {
    queryClient.setQueryData(detailKey(report.id), report);
    await queryClient.invalidateQueries({
      queryKey: ["reports"],
      predicate: (query) => query.queryKey[1] !== "detail",
    });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
};

/**
 * 承認と差し戻しのボタン(画面定義書 SCR-05)。直属の上長で提出済みのときだけ出す(permissions.can_review)。
 * スマートフォンでは画面の下に固定する(画面定義書 3.5)
 */
export function ReviewActions({ report }: { report: ReportDetail }) {
  const applyReport = useApplyReport();
  const onError = useOperationError(report.id);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const approve = useMutation({
    mutationFn: () => api.post(`/reports/${report.id}/approve`, { schema: reportDetailSchema }),
    onSuccess: async (updated) => {
      setConfirmApprove(false);
      await applyReport(updated);
      notifySuccess("日報を承認しました");
    },
    onError: (error) => {
      setConfirmApprove(false);
      onError(error);
    },
  });

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-2 border-t bg-card p-3 shadow-lg md:static md:flex md:justify-end md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setReturnOpen(true)}
          className="h-12 font-bold md:h-11 md:min-w-32"
        >
          <Undo2Icon aria-hidden="true" />
          差し戻し
        </Button>
        <Button
          type="button"
          onClick={() => setConfirmApprove(true)}
          className="h-12 font-bold md:h-11 md:min-w-32"
        >
          <CheckIcon aria-hidden="true" />
          承認
        </Button>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title="この日報を承認しますか?"
        description={`${report.user.name}さんに通知します。承認した後は取り消せません。`}
        confirmLabel="承認する"
        onConfirm={() => approve.mutate()}
        pending={approve.isPending}
      />

      <ReturnDialog
        report={report}
        open={returnOpen}
        onOpenChange={setReturnOpen}
        onReturned={applyReport}
        onError={onError}
      />
    </>
  );
}

type ReturnDialogProps = {
  report: ReportDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReturned: (report: ReportDetail) => Promise<void>;
  onError: (error: unknown) => void;
};

/** 差し戻しダイアログ。理由は必須、1,000文字以内(画面定義書 SCR-05) */
function ReturnDialog({ report, open, onOpenChange, onReturned, onError }: ReturnDialogProps) {
  const form = useForm<ReturnInput>({
    resolver: zodResolver(returnInputSchema),
    defaultValues: { reason: "" },
  });
  const sendBack = useMutation({
    mutationFn: (values: ReturnInput) =>
      api.post(`/reports/${report.id}/return`, { body: values, schema: reportDetailSchema }),
    onSuccess: async (updated) => {
      onOpenChange(false);
      form.reset();
      await onReturned(updated);
      notifySuccess("日報を差し戻しました");
    },
    onError: (error) => {
      if (applyServerErrors(error, form.setError)) return;
      onOpenChange(false);
      onError(error);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => sendBack.mutate(values))}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold">日報を差し戻す</DialogTitle>
            <DialogDescription>
              理由を書いて差し戻します。{report.user.name}さんに通知します。
            </DialogDescription>
          </DialogHeader>
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="return-reason">差し戻し理由</FieldLabel>
                <Textarea
                  {...field}
                  id="return-reason"
                  rows={4}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  {RETURN_REASON_MAX_LENGTH.toLocaleString("ja-JP")}文字以内
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sendBack.isPending}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={sendBack.isPending}
              className="font-bold"
            >
              {sendBack.isPending ? "差し戻し中…" : "差し戻す"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** コメントの投稿欄(画面定義書 SCR-05)。本人と直属の上長だけに出す(permissions.can_comment) */
export function CommentForm({ report }: { report: ReportDetail }) {
  const queryClient = useQueryClient();
  const onError = useOperationError(report.id);
  const form = useForm<CommentInput>({
    resolver: zodResolver(commentInputSchema),
    defaultValues: { body: "" },
  });
  const post = useMutation({
    mutationFn: (values: CommentInput) =>
      api.post(`/reports/${report.id}/comments`, { body: values, schema: reportCommentSchema }),
    onSuccess: async (comment: ReportComment) => {
      // 投稿したコメントを一覧の最後に足す(古い順)
      queryClient.setQueryData<ReportDetail>(detailKey(report.id), (current) =>
        current ? { ...current, comments: [...current.comments, comment] } : current,
      );
      form.reset();
      notifySuccess("コメントを投稿しました");
      await queryClient.invalidateQueries({
        queryKey: ["reports"],
        predicate: (query) => query.queryKey[1] !== "detail",
      });
    },
    onError: (error) => {
      if (applyServerErrors(error, form.setError)) return;
      onError(error);
    },
  });

  return (
    <form
      noValidate
      aria-label="コメントの投稿"
      onSubmit={form.handleSubmit((values) => post.mutate(values))}
      className="flex flex-col gap-3 border-t pt-4"
    >
      <Controller
        name="body"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="comment-body">コメント</FieldLabel>
            <Textarea {...field} id="comment-body" rows={3} aria-invalid={fieldState.invalid} />
            <FieldDescription>
              {COMMENT_BODY_MAX_LENGTH.toLocaleString("ja-JP")}文字以内
            </FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Button type="submit" disabled={post.isPending} className="self-end font-bold md:min-w-32">
        {post.isPending ? "投稿中…" : "投稿する"}
      </Button>
    </form>
  );
}
