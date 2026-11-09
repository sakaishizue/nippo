import { zodResolver } from "@hookform/resolvers/zod";
import {
  customerDetailSchema,
  DEAL_STAGE_LABELS,
  DEAL_STAGES,
  type DealDetailResponse,
  dealDetailSchema,
  formatYen,
  userOptionsSchema,
} from "@nippo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useMe } from "@/auth/me";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { NumberInput } from "@/components/NumberInput";
import { notifyError, notifySuccess } from "@/components/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors, SERVER_ERROR_NAME } from "@/lib/form-errors";
import { NotFoundPage } from "@/pages/NotFoundPage";
import {
  type DealFormInput,
  type DealFormOutput,
  dealFormDefaults,
  dealFormSchema,
  toDealRequest,
} from "./deal-form";

type FormProps = {
  deal?: DealDetailResponse;
  /** 登録で選んでおく顧客(顧客詳細の「商談を追加」から開いたとき) */
  initialCustomer?: { id: number; name: string } | null;
};

function DealForm({ deal, initialCustomer }: FormProps) {
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<DealFormInput, unknown, DealFormOutput>({
    resolver: zodResolver(dealFormSchema),
    // 担当者の初期値は、一般なら自分(画面定義書 SCR-13)
    defaultValues: dealFormDefaults(deal, {
      customer: initialCustomer,
      ownerId: me.role === "member" ? me.id : null,
    }),
  });
  const amount = useWatch({ control: form.control, name: "amount" });

  const owners = useQuery({
    queryKey: ["user-options", "member"],
    queryFn: ({ signal }) =>
      api.get("/user-options", { query: { role: "member" }, schema: userOptionsSchema, signal }),
  });
  // 今の担当者が無効になっていても、選択欄に表示する
  const ownerOptions = [
    ...(owners.data?.items ?? []),
    ...(deal && !owners.data?.items.some((owner) => owner.id === deal.owner.id)
      ? [deal.owner]
      : []),
  ];

  const save = useMutation({
    mutationFn: (values: DealFormOutput) => {
      const body = toDealRequest(values);
      return deal
        ? api.put(`/deals/${deal.id}`, { body, schema: dealDetailSchema })
        : api.post("/deals", { body, schema: dealDetailSchema });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      notifySuccess(deal ? "商談を保存しました" : "商談を登録しました");
      await navigate(`/deals/${saved.id}`);
    },
    onError: (error) => {
      if (applyServerErrors(error, form.setError)) return;
      // 訪問記録がある商談の顧客の変更(409)は、API のメッセージを表示する
      if (isApiError(error) && error.status === 409) {
        form.setError(SERVER_ERROR_NAME, { type: "server", message: error.message });
        return;
      }
      notifyError("保存できませんでした。時間をおいてやり直してください");
    },
  });

  const serverError = form.formState.errors.root?.serverError;
  const customerLocked = deal?.has_visits === true;
  const parsedAmount = Number(amount.replaceAll(",", ""));
  const amountPreview =
    amount.trim() !== "" && Number.isSafeInteger(parsedAmount) && parsedAmount >= 0
      ? formatYen(parsedAmount)
      : null;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="flex flex-col gap-5"
    >
      {serverError && (
        <p
          role="alert"
          className="max-w-2xl rounded-xl border border-destructive-outline bg-destructive-surface p-4 text-destructive"
        >
          {serverError.message}
        </p>
      )}

      <section className="flex max-w-2xl flex-col rounded-xl border bg-card p-4 shadow-xs md:p-6">
        <FieldGroup>
          <Controller
            name="customer"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-customer">顧客</FieldLabel>
                <CustomerCombobox
                  id="deal-customer"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={fieldState.invalid}
                  disabled={customerLocked}
                />
                {customerLocked && (
                  <FieldDescription>訪問記録があるため、顧客は変更できません</FieldDescription>
                )}
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-name">商談名</FieldLabel>
                <Input
                  {...field}
                  id="deal-name"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>100文字以内</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="owner_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-owner">担当者</FieldLabel>
                <NativeSelect
                  {...field}
                  id="deal-owner"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  <NativeSelectOption value="">選択してください</NativeSelectOption>
                  {ownerOptions.map((owner) => (
                    <NativeSelectOption key={owner.id} value={String(owner.id)}>
                      {owner.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="stage"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-stage">ステージ</FieldLabel>
                <NativeSelect
                  {...field}
                  id="deal-stage"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  {DEAL_STAGES.map((stage) => (
                    <NativeSelectOption key={stage} value={stage}>
                      {DEAL_STAGE_LABELS[stage]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="amount"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-amount">見込金額(円)</FieldLabel>
                <NumberInput {...field} id="deal-amount" aria-invalid={fieldState.invalid} />
                <FieldDescription>
                  {amountPreview ? `${amountPreview}。` : ""}0以上の整数。省略できます
                </FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="expected_close_date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="deal-close-date">受注予定日</FieldLabel>
                <Input
                  {...field}
                  id="deal-close-date"
                  type="date"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>省略できます</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
      </section>

      <div className="flex max-w-2xl flex-col-reverse gap-3 md:flex-row md:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate(deal ? `/deals/${deal.id}` : "/deals")}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={save.isPending} className="font-bold md:min-w-32">
          {save.isPending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}

const positiveId = (value: string | null | undefined) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** SCR-13 商談登録。`?customer_id=` があれば、その顧客を選んでおく */
export function DealCreatePage() {
  const [searchParams] = useSearchParams();
  const customerId = positiveId(searchParams.get("customer_id"));
  const customer = useQuery({
    queryKey: ["customers", "detail", customerId],
    queryFn: ({ signal }) =>
      api.get(`/customers/${customerId}`, { schema: customerDetailSchema, signal }),
    enabled: customerId !== null,
  });
  const waiting = customerId !== null && customer.isPending;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">商談登録</h1>
      {waiting ? (
        <p className="text-muted-foreground">読み込み中…</p>
      ) : (
        <DealForm
          initialCustomer={
            customer.data ? { id: customer.data.id, name: customer.data.name } : null
          }
        />
      )}
    </div>
  );
}

/** SCR-13 商談編集 */
export function DealEditPage() {
  const dealId = positiveId(useParams().id);
  const deal = useQuery({
    queryKey: ["deals", "detail", dealId],
    queryFn: ({ signal }) => api.get(`/deals/${dealId}`, { schema: dealDetailSchema, signal }),
    enabled: dealId !== null,
  });

  if (dealId === null || (isApiError(deal.error) && deal.error.status === 404))
    return <NotFoundPage />;

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <h1 className="text-xl font-bold">商談編集</h1>
      {deal.isError ? (
        <p role="alert" className="text-destructive">
          商談を読み込めませんでした。画面を再読み込みしてください。
        </p>
      ) : deal.data ? (
        <DealForm key={deal.data.id} deal={deal.data} />
      ) : (
        <p className="text-muted-foreground">読み込み中…</p>
      )}
    </div>
  );
}
