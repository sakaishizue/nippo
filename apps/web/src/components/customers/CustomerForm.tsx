import { zodResolver } from "@hookform/resolvers/zod";
import {
  CUSTOMER_ADDRESS_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  type CustomerDetail,
  customerDetailSchema,
  customerInputSchema,
} from "@nippo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { notifyError } from "@/components/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, isApiError } from "@/lib/api";
import { applyServerErrors } from "@/lib/form-errors";

// 確認済みかどうかは、警告を見て選んだときにだけ送る
const customerFormSchema = customerInputSchema.omit({ confirm_duplicate: true });
type CustomerFormInput = z.input<typeof customerFormSchema>;
type CustomerFormOutput = z.output<typeof customerFormSchema>;

type Props = {
  /** 編集する顧客。省略すると登録 */
  customer?: CustomerDetail;
  /** 保存できたとき。登録と更新のレスポンスを渡す */
  onSaved: (customer: CustomerDetail) => void;
  /** キャンセルのボタンを出す場合に渡す */
  onCancel?: () => void;
  /** 入力欄の id の頭に付ける文字列。ダイアログで同じ画面に2つ置くときに重ならないように */
  idPrefix?: string;
};

/**
 * SCR-10 顧客登録・編集のフォーム。画面にも、日報入力のダイアログにも置ける(画面を移動しない)。
 * 同じ名前の顧客があれば警告し、確認したら登録する
 */
export function CustomerForm({ customer, onSaved, onCancel, idPrefix = "customer" }: Props) {
  const queryClient = useQueryClient();
  const form = useForm<CustomerFormInput, unknown, CustomerFormOutput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: customer?.name ?? "",
      address: customer?.address ?? "",
      phone: customer?.phone ?? "",
    },
  });
  // 同じ名前の顧客があったときの入力。警告を出し、確認したらこの入力で保存し直す
  const [duplicate, setDuplicate] = useState<CustomerFormOutput | null>(null);

  const save = useMutation({
    mutationFn: ({ values, confirmed }: { values: CustomerFormOutput; confirmed: boolean }) => {
      const body = { ...values, confirm_duplicate: confirmed };
      return customer
        ? api.put(`/customers/${customer.id}`, { body, schema: customerDetailSchema })
        : api.post("/customers", { body, schema: customerDetailSchema });
    },
    onSuccess: async (saved) => {
      setDuplicate(null);
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      onSaved(saved);
    },
    onError: (error, { values }) => {
      if (isApiError(error) && error.code === "DUPLICATE_CUSTOMER_NAME") {
        setDuplicate(values);
        return;
      }
      if (!applyServerErrors(error, form.setError)) {
        notifyError("保存できませんでした。時間をおいてやり直してください");
      }
    },
  });

  const fieldId = (name: string) => `${idPrefix}-${name}`;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => save.mutate({ values, confirmed: false }))}
      className="flex flex-col gap-5"
    >
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("name")}>顧客名</FieldLabel>
              <Input
                {...field}
                id={fieldId("name")}
                autoComplete="organization"
                aria-invalid={fieldState.invalid}
                onChange={(event) => {
                  field.onChange(event);
                  // 名前を直したら、前の警告は消す
                  setDuplicate(null);
                }}
              />
              <FieldDescription>{CUSTOMER_NAME_MAX_LENGTH}文字以内</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="address"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("address")}>住所</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={fieldId("address")}
                autoComplete="street-address"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {CUSTOMER_ADDRESS_MAX_LENGTH}文字以内。省略できます
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="phone"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("phone")}>電話番号</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id={fieldId("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                数字とハイフンで入力します(例: 03-1234-5678)。省略できます
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      {duplicate && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-warning-outline bg-warning-surface p-4 text-warning"
        >
          <p className="font-bold">同じ名前の顧客が登録されています</p>
          <p className="text-sm text-foreground">
            別の顧客であれば、このまま保存できます。同じ顧客であれば、登録済みの顧客を使ってください。
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ values: duplicate, confirmed: true })}
            >
              同じ名前で保存する
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            キャンセル
          </Button>
        )}
        <Button type="submit" disabled={save.isPending} className="font-bold md:min-w-32">
          {save.isPending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}
