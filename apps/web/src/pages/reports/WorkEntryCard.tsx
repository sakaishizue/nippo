import { WORK_CATEGORIES, WORK_CATEGORY_LABELS, WORK_NOTE_MAX_LENGTH } from "@nippo/shared";
import { Trash2Icon, UserPlusIcon } from "lucide-react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { DealCombobox } from "@/components/deals/DealCombobox";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ReportFormValues } from "./report-form";

type Props = {
  index: number;
  /** 行の削除。1行だけでも削除できる(下書きは作業なしでも保存できる) */
  onRemove: () => void;
  /** 顧客の登録ダイアログを開く。登録した顧客は、この行の訪問先に入る */
  onRegisterCustomer: () => void;
};

/**
 * 作業の1行(画面定義書 SCR-04 の「作業」と「訪問の詳細」)。
 * スマートフォンでは1件ずつカードで縦に並べ、PC では作業区分、時間、商談を横に並べる
 */
export function WorkEntryCard({ index, onRemove, onRegisterCustomer }: Props) {
  const { control, setValue, getValues } = useFormContext<ReportFormValues>();
  const prefix = `work_entries.${index}` as const;
  const category = useWatch({ control, name: `${prefix}.category` });
  const customer = useWatch({ control, name: `${prefix}.visit.customer` });
  const isVisit = category === "visit";
  const fieldId = (name: string) => `work-${index}-${name}`;
  const headingId = fieldId("heading");

  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs md:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="font-bold">
          作業{index + 1}
        </h3>
        <Button
          type="button"
          variant="ghost"
          onClick={onRemove}
          aria-label={`作業${index + 1}を削除`}
          className="text-muted-foreground"
        >
          <Trash2Icon aria-hidden="true" />
          削除
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,10rem)_minmax(0,8rem)_minmax(0,1fr)]">
        <Controller
          name={`${prefix}.category`}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("category")}>作業区分</FieldLabel>
              <NativeSelect
                {...field}
                id={fieldId("category")}
                className="w-full"
                aria-invalid={fieldState.invalid}
              >
                {WORK_CATEGORIES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {WORK_CATEGORY_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name={`${prefix}.minutes`}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("minutes")}>時間(分)</FieldLabel>
              <NumberInput {...field} id={fieldId("minutes")} aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name={`${prefix}.deal`}
          control={control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={fieldId("deal")}>商談</FieldLabel>
              <DealCombobox
                id={fieldId("deal")}
                value={field.value}
                onChange={(deal) => {
                  field.onChange(deal);
                  // 訪問先をまだ選んでいなければ、商談の顧客を訪問先にする
                  if (isVisit && deal?.customer && !getValues(`${prefix}.visit.customer`)) {
                    setValue(`${prefix}.visit.customer`, deal.customer, { shouldDirty: true });
                  }
                }}
                onBlur={field.onBlur}
                // 訪問の行は、訪問先の顧客の商談に絞り込む
                customerId={isVisit ? (customer?.id ?? null) : null}
                invalid={fieldState.invalid}
              />
              <FieldDescription>
                {isVisit && customer
                  ? `${customer.name}の商談から選びます。省略できます`
                  : "省略できます"}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>

      {isVisit && (
        <fieldset className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
          <legend className="sr-only">作業{index + 1}の訪問の詳細</legend>
          <p aria-hidden="true" className="text-sm font-bold">
            訪問の詳細
          </p>
          <Controller
            name={`${prefix}.visit.customer`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={fieldId("customer")}>顧客</FieldLabel>
                <div className="flex flex-col gap-2 md:flex-row">
                  <div className="min-w-0 flex-1">
                    <CustomerCombobox
                      id={fieldId("customer")}
                      value={field.value}
                      onChange={(next) => {
                        field.onChange(next);
                        // 商談の顧客が合わなくなったら、商談の選択を外す
                        const deal = getValues(`${prefix}.deal`);
                        if (next && deal && deal.customer?.id !== next.id) {
                          setValue(`${prefix}.deal`, null, { shouldDirty: true });
                        }
                      }}
                      onBlur={field.onBlur}
                      invalid={fieldState.invalid}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={onRegisterCustomer}>
                    <UserPlusIcon aria-hidden="true" />
                    顧客を登録
                  </Button>
                </div>
                <FieldDescription>一覧にない顧客は「顧客を登録」から登録できます</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name={`${prefix}.visit.contact_name`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={fieldId("contact")}>面談相手</FieldLabel>
                <Input
                  {...field}
                  id={fieldId("contact")}
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>省略できます</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name={`${prefix}.visit.content`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={fieldId("content")}>訪問内容</FieldLabel>
                <Textarea
                  {...field}
                  id={fieldId("content")}
                  rows={3}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>提出時は必須</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name={`${prefix}.visit.next_action`}
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={fieldId("next-action")}>次回アクション</FieldLabel>
                <Textarea
                  {...field}
                  id={fieldId("next-action")}
                  rows={2}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>省略できます</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </fieldset>
      )}

      <Controller
        name={`${prefix}.note`}
        control={control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={fieldId("note")}>メモ</FieldLabel>
            <Input
              {...field}
              id={fieldId("note")}
              autoComplete="off"
              aria-invalid={fieldState.invalid}
            />
            <FieldDescription>{WORK_NOTE_MAX_LENGTH}文字以内。省略できます</FieldDescription>
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </li>
  );
}
