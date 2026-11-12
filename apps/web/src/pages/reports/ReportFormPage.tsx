import {
  DAILY_MINUTES_MAX,
  formatDate,
  formatMinutes,
  paginatedSchema,
  REPORT_TEXT_MAX_LENGTH,
  type ReportDetail,
  reportDetailSchema,
  reportListItemSchema,
  todayInJst,
} from "@nippo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { notifyError, notifyInfo, notifySuccess } from "@/components/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors, SERVER_ERROR_NAME } from "@/lib/form-errors";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "@/pages/NotFoundPage";
import {
  latestReturnReason,
  newWorkEntry,
  type ReportFormValues,
  reportFormDefaults,
  reportFormResolver,
  reportSubmitErrors,
  toReportFormField,
  toReportRequest,
  totalMinutesOf,
} from "./report-form";
import { WorkEntryCard } from "./WorkEntryCard";

const reportListSchema = paginatedSchema(reportListItemSchema);
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

type FormProps = {
  /** 編集する日報。省略すると新規作成 */
  report?: ReportDetail;
  /** 新規作成の日付の初期値(リマインドの通知から開いたときなど)。省略すると今日 */
  initialDate?: string;
};

function ReportForm({ report, initialDate }: FormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = todayInJst();
  const form = useForm<ReportFormValues>({
    resolver: reportFormResolver,
    defaultValues: reportFormDefaults(report, initialDate ?? today),
  });
  const entries = useFieldArray({ control: form.control, name: "work_entries" });
  const watchedEntries = useWatch({ control: form.control, name: "work_entries" });
  const reportDate = useWatch({ control: form.control, name: "report_date" });
  const { allowLeave, dialog: leaveDialog } = useUnsavedChanges(form.formState.isDirty);

  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // 顧客の登録ダイアログを開いている作業の行
  const [customerDialogFor, setCustomerDialogFor] = useState<number | null>(null);
  // 保存しようとした日付に別の日報があったときの、その日報のID
  const [existingReportId, setExistingReportId] = useState<number | null>(null);
  // 保存を始めたら、日付の重複チェックをやめる(保存した日報そのものを見つけてしまうため)
  const [saving, setSaving] = useState(false);

  const isReturned = report?.status === "returned";
  const returnReason = report && isReturned ? latestReturnReason(report) : null;
  const total = totalMinutesOf(watchedEntries);

  // 新規作成で、選んだ日付の日報が既にあれば、その日報を開く(画面定義書 SCR-04 の入力チェック)
  const existing = useQuery({
    queryKey: ["reports", "on-date", reportDate],
    queryFn: ({ signal }) =>
      api.get("/reports", {
        query: { from: reportDate, to: reportDate, per_page: 1 },
        schema: reportListSchema,
        signal,
      }),
    enabled: !report && !saving && isDate(reportDate) && reportDate <= today,
  });
  const existingId = existing.data?.items[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 既存の日報が見つかったときだけ動かす
  useEffect(() => {
    if (existingId === undefined || saving) return;
    // 日付のほかに入力がなければ、そのまま移動する。入力があれば、移動の前に警告する
    const dirtyFields = Object.keys(form.formState.dirtyFields);
    if (dirtyFields.every((name) => name === "report_date")) allowLeave();
    notifyInfo(`${formatDate(reportDate)}の日報は作成済みのため、その日報を開きます`);
    void navigate(`/reports/${existingId}/edit`, { replace: true });
  }, [existingId]);

  const saveReport = async (values: ReportFormValues) => {
    setSaving(true);
    const body = toReportRequest(values);
    return report
      ? api.put(`/reports/${report.id}`, { body, schema: reportDetailSchema })
      : api.post("/reports", { body, schema: reportDetailSchema });
  };

  const afterSaved = async (saved: ReportDetail, message: string) => {
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    notifySuccess(message);
    allowLeave();
    await navigate(`/reports/${saved.id}`);
  };

  /** 保存と提出のエラーを、項目や画面上部に表示する */
  const showError = (error: unknown) => {
    setSaving(false);
    if (applyServerErrors(error, form.setError, toReportFormField)) return;
    if (isApiError(error) && error.code === "REPORT_ALREADY_EXISTS") {
      setExistingReportId(error.existingReportId ?? null);
      form.setError(
        "report_date",
        { type: "server", message: "この日付の日報は作成済みです" },
        { shouldFocus: true },
      );
      return;
    }
    if (isApiError(error) && [404, 409].includes(error.status)) {
      form.setError(SERVER_ERROR_NAME, { type: "server", message: error.message });
      window.scrollTo({ top: 0 });
      return;
    }
    notifyError("保存できませんでした。時間をおいてやり直してください");
  };

  const saveDraft = useMutation({
    mutationFn: saveReport,
    onSuccess: (saved) => afterSaved(saved, "下書きを保存しました"),
    onError: showError,
  });

  // 提出は、保存してから提出する。新規作成で、保存できて提出できなかった場合は、その日報の編集を開く
  const submit = useMutation({
    mutationFn: async (values: ReportFormValues) => {
      const saved = await saveReport(values);
      try {
        return await api.post(`/reports/${saved.id}/submit`, { schema: reportDetailSchema });
      } catch (error) {
        throw Object.assign(new Error("submit failed"), { cause: error, savedId: saved.id });
      }
    },
    onSuccess: (submitted) => afterSaved(submitted, "日報を提出しました"),
    onError: (error) => {
      setConfirmSubmit(false);
      const savedId = (error as { savedId?: number }).savedId;
      const cause = savedId === undefined ? error : error.cause;
      if (!report && savedId !== undefined) {
        notifyError("下書きは保存しましたが、提出できませんでした。内容を確かめて提出してください");
        allowLeave();
        void navigate(`/reports/${savedId}/edit`, { replace: true });
        return;
      }
      showError(cause);
    },
  });

  const onSaveDraft = form.handleSubmit((values) => saveDraft.mutate(values));
  // 提出の前に、提出時のチェックをしてから確認ダイアログを出す
  const onSubmit = form.handleSubmit((values) => {
    const issues = reportSubmitErrors(values);
    if (issues.length === 0) {
      setConfirmSubmit(true);
      return;
    }
    issues.forEach(({ name, message }, i) => {
      form.setError(
        name as Parameters<typeof form.setError>[0],
        { type: "submit", message },
        { shouldFocus: i === 0 },
      );
    });
  });

  const pending = saveDraft.isPending || submit.isPending;
  const serverError = form.formState.errors.root?.serverError;
  const entriesError = form.formState.errors.work_entries?.root;
  const overLimit = total > DAILY_MINUTES_MAX;

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 pb-36 md:pb-0">
        {returnReason !== null && (
          <section
            aria-labelledby="return-reason-heading"
            className="flex flex-col gap-1 rounded-xl border border-warning-outline bg-warning-surface p-4"
          >
            <h2 id="return-reason-heading" className="font-bold text-warning">
              差し戻されています
            </h2>
            <p className="whitespace-pre-wrap">{returnReason}</p>
          </section>
        )}
        {serverError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
          >
            {serverError.message}
          </p>
        )}

        <section className="rounded-xl border bg-card p-4 shadow-xs md:p-6">
          <Controller
            name="report_date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="md:max-w-xs">
                <FieldLabel htmlFor="report-date">日付</FieldLabel>
                <Input
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    setExistingReportId(null);
                  }}
                  id="report-date"
                  type="date"
                  max={today}
                  // 日付は下書きの間だけ変更できる
                  disabled={isReturned}
                  aria-invalid={fieldState.invalid}
                />
                {isReturned && (
                  <FieldDescription>差し戻し中の日報は、日付を変更できません</FieldDescription>
                )}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                {existingReportId !== null && (
                  <Link
                    to={`/reports/${existingReportId}/edit`}
                    className="text-sm text-primary underline"
                  >
                    作成済みの日報を開く
                  </Link>
                )}
              </Field>
            )}
          />
        </section>

        <section aria-labelledby="work-heading" className="flex flex-col gap-3">
          <h2 id="work-heading" className="text-base font-bold md:text-lg">
            作業
          </h2>
          {entriesError && (
            <p role="alert" className="text-sm text-destructive">
              {entriesError.message}
            </p>
          )}
          {entries.fields.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-muted-foreground">
              作業がありません。「作業を追加」で入力します。
            </p>
          ) : (
            <ul aria-labelledby="work-heading" className="flex flex-col gap-3">
              {entries.fields.map((entry, index) => (
                <WorkEntryCard
                  key={entry.id}
                  index={index}
                  onRemove={() => entries.remove(index)}
                  onRegisterCustomer={() => setCustomerDialogFor(index)}
                />
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => entries.append(newWorkEntry())}
            className="self-start"
          >
            <PlusIcon aria-hidden="true" />
            作業を追加
          </Button>
        </section>

        <section className="flex flex-col gap-5 rounded-xl border bg-card p-4 shadow-xs md:p-6">
          <Controller
            name="reflection"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="report-reflection">所感</FieldLabel>
                <Textarea
                  {...field}
                  id="report-reflection"
                  rows={4}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  提出時は必須。{REPORT_TEXT_MAX_LENGTH.toLocaleString("ja-JP")}文字以内
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="next_plan"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="report-next-plan">翌日の予定</FieldLabel>
                <Textarea
                  {...field}
                  id="report-next-plan"
                  rows={3}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  提出時は必須。{REPORT_TEXT_MAX_LENGTH.toLocaleString("ja-JP")}文字以内
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </section>

        {/* スマートフォンでは、合計時間と「下書き保存」「提出」を画面の下に固定する(画面定義書 3.5) */}
        <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t bg-card p-3 shadow-lg md:static md:flex-row md:items-center md:justify-between md:rounded-xl md:border md:p-4 md:shadow-xs">
          <p
            aria-live="polite"
            className={cn("text-sm", overLimit && "font-bold text-destructive")}
          >
            合計時間 <output className="text-base font-bold">{formatMinutes(total)}</output>
            {overLimit && `(${formatMinutes(DAILY_MINUTES_MAX)}を超えています)`}
          </p>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => void onSaveDraft()}
              className="h-12 md:h-11 md:min-w-32"
            >
              {saveDraft.isPending ? "保存中…" : "下書き保存"}
            </Button>
            <Button type="submit" disabled={pending} className="h-12 font-bold md:h-11 md:min-w-32">
              {submit.isPending ? "提出中…" : "提出"}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="提出すると編集できなくなります。提出しますか?"
        confirmLabel="提出する"
        onConfirm={() => submit.mutate(form.getValues())}
        pending={submit.isPending}
      />

      <Dialog
        open={customerDialogFor !== null}
        onOpenChange={(open) => !open && setCustomerDialogFor(null)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">顧客を登録</DialogTitle>
            <DialogDescription>登録した顧客を、訪問先に選びます。</DialogDescription>
          </DialogHeader>
          <CustomerForm
            idPrefix="new-customer"
            onCancel={() => setCustomerDialogFor(null)}
            onSaved={(customer) => {
              if (customerDialogFor !== null) {
                const name = `work_entries.${customerDialogFor}` as const;
                form.setValue(
                  `${name}.visit.customer`,
                  { id: customer.id, name: customer.name },
                  { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
                );
                // 新しい顧客の商談はまだないため、選んでいた商談は外す
                form.setValue(`${name}.deal`, null, { shouldDirty: true });
              }
              notifySuccess("顧客を登録しました");
              setCustomerDialogFor(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {leaveDialog}
    </FormProvider>
  );
}

const positiveId = (value: string | undefined) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** SCR-04 日報入力(新規作成)。日付の初期値は今日 */
export function ReportCreatePage() {
  // `?date=` があれば、その日付で作り始める。未来の日付と形式の誤りは無視して今日にする
  const [searchParams] = useSearchParams();
  const date = searchParams.get("date");
  const initialDate = date && isDate(date) && date <= todayInJst() ? date : undefined;
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">日報作成</h1>
      <ReportForm initialDate={initialDate} />
    </div>
  );
}

/** SCR-04 日報入力(編集)。編集できない日報(提出済み、承認済み)は日報詳細を開く */
export function ReportEditPage() {
  const reportId = positiveId(useParams().id);
  const report = useQuery({
    queryKey: ["reports", "detail", reportId],
    queryFn: ({ signal }) =>
      api.get(`/reports/${reportId}`, { schema: reportDetailSchema, signal }),
    enabled: reportId !== null,
  });

  if (reportId === null || (isApiError(report.error) && report.error.status === 404))
    return <NotFoundPage />;
  if (report.data && !report.data.permissions.can_edit)
    return <Navigate to={`/reports/${report.data.id}`} replace />;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">日報編集</h1>
      {report.isError ? (
        <p role="alert" className="text-destructive">
          日報を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : report.data ? (
        <ReportForm key={report.data.id} report={report.data} />
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
