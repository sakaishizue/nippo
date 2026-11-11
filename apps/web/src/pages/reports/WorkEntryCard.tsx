import { WORK_CATEGORIES, WORK_CATEGORY_LABELS, WORK_NOTE_MAX_LENGTH } from "@nippo/shared";
import { Trash2Icon } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { DealCombobox } from "@/components/deals/DealCombobox";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ReportFormValues } from "./report-form";

type Props = {
  index: number;
  /** 行の削除。1行だけでも削除できる(下書きは作業なしでも保存できる) */
  onRemove: () => void;
};

/**
 * 作業の1行(画面定義書 SCR-04 の「作業」)。
 * スマートフォンでは1件ずつカードで縦に並べ、PC では作業区分、時間、商談を横に並べる
 */
export function WorkEntryCard({ index, onRemove }: Props) {
  const { control } = useFormContext<ReportFormValues>();
  const prefix = `work_entries.${index}` as const;
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
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={fieldState.invalid}
              />
              <FieldDescription>省略できます</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </div>

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
