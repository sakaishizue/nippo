import { customerListItemSchema, paginatedSchema } from "@nippo/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type CustomerOption = { id: number; name: string };

const optionsSchema = paginatedSchema(customerListItemSchema);
// 候補に出す件数。顧客名を入力して絞り込む
const OPTION_LIMIT = 20;

type Props = {
  id: string;
  value: CustomerOption | null;
  onChange: (value: CustomerOption | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** 入力欄から離れたとき(React Hook Form の onBlur に渡す) */
  onBlur?: () => void;
};

/**
 * 顧客を顧客名で検索して選ぶ入力欄(画面定義書の「選択(検索付き)」)。
 * 入力した文字で API(GET /customers?q=)を検索し、候補を出す
 */
export function CustomerCombobox({
  id,
  value,
  onChange,
  disabled,
  invalid,
  placeholder = "顧客名を入力して選択",
  onBlur,
}: Props) {
  const [inputValue, setInputValue] = useState(value?.name ?? "");
  // 外から値が変わったとき(ダイアログで登録した顧客を選んだときなど)は、入力欄の文字も合わせる
  const [shownValue, setShownValue] = useState(value);
  if (value?.id !== shownValue?.id) {
    setShownValue(value);
    setInputValue(value?.name ?? "");
  }
  // 選んだ顧客の名前が入力欄にあるときは、絞り込まずに一覧を出す
  const query = useDebouncedValue(inputValue === value?.name ? "" : inputValue.trim());
  const options = useQuery({
    queryKey: ["customers", "options", query],
    queryFn: ({ signal }) =>
      api.get("/customers", {
        query: { q: query || null, per_page: OPTION_LIMIT },
        schema: optionsSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: !disabled,
  });
  const items: CustomerOption[] = (options.data?.items ?? []).map(({ id, name }) => ({ id, name }));
  // 選んだ顧客が候補にないとき(検索で外れたときなど)も、表示できるように候補に入れる
  if (value && !items.some((item) => item.id === value.id)) items.unshift(value);

  return (
    <Combobox<CustomerOption>
      items={items}
      // 絞り込みは API で行う
      filter={null}
      value={value}
      onValueChange={(next) => onChange(next ?? null)}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(item) => item.name}
      isItemEqualToValue={(item, selected) => item.id === selected.id}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        onBlur={onBlur}
        showClear={!disabled && value !== null}
        className="h-11 w-full text-base md:text-sm"
      />
      <ComboboxContent>
        <ComboboxEmpty>{options.isFetching ? "検索中…" : "該当する顧客がありません"}</ComboboxEmpty>
        <ComboboxList>
          {(item: CustomerOption) => (
            <ComboboxItem key={item.id} value={item} className="min-h-11 text-base md:text-sm">
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
