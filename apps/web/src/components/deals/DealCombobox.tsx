import { dealSchema, paginatedSchema } from "@nippo/shared";
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

type Ref = { id: number; name: string };

/** 商談の選択肢。顧客が分からない場合(日報から読み込んだ訪問以外の行など)は null */
export type DealOption = Ref & { customer: Ref | null };

const optionsSchema = paginatedSchema(dealSchema);
// 候補に出す件数。商談名を入力して絞り込む
const OPTION_LIMIT = 20;

type Props = {
  id: string;
  value: DealOption | null;
  onChange: (value: DealOption | null) => void;
  /** 指定すると、その顧客の商談だけを候補にする(日報の訪問の行) */
  customerId?: number | null;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  onBlur?: () => void;
};

/**
 * 商談を商談名で検索して選ぶ入力欄(画面定義書の「選択(検索付き)」)。
 * 入力した文字で API(GET /deals?q=)を検索し、候補に顧客名を添えて出す
 */
export function DealCombobox({
  id,
  value,
  onChange,
  customerId = null,
  disabled,
  invalid,
  placeholder = "商談名を入力して選択",
  onBlur,
}: Props) {
  const [inputValue, setInputValue] = useState(value?.name ?? "");
  // 外から値が変わったとき(顧客を変えて選択を外したときなど)は、入力欄の文字も合わせる
  const [shownValue, setShownValue] = useState(value);
  if (value?.id !== shownValue?.id) {
    setShownValue(value);
    setInputValue(value?.name ?? "");
  }
  // 選んだ商談の名前が入力欄にあるときは、絞り込まずに一覧を出す
  const query = useDebouncedValue(inputValue === value?.name ? "" : inputValue.trim());
  const options = useQuery({
    queryKey: ["deals", "options", customerId, query],
    queryFn: ({ signal }) =>
      api.get("/deals", {
        query: { q: query || null, customer_id: customerId, per_page: OPTION_LIMIT },
        schema: optionsSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: !disabled,
  });
  const items: DealOption[] = (options.data?.items ?? []).map(({ id, name, customer }) => ({
    id,
    name,
    customer,
  }));
  // 選んだ商談が候補にないときも、表示できるように候補に入れる
  if (value && !items.some((item) => item.id === value.id)) items.unshift(value);

  return (
    <Combobox<DealOption>
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
        <ComboboxEmpty>{options.isFetching ? "検索中…" : "該当する商談がありません"}</ComboboxEmpty>
        <ComboboxList>
          {(item: DealOption) => (
            <ComboboxItem key={item.id} value={item} className="min-h-11 text-base md:text-sm">
              <span className="flex flex-col">
                <span>{item.name}</span>
                {item.customer && (
                  <span className="text-xs text-muted-foreground">{item.customer.name}</span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
