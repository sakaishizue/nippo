import {
  addMonths,
  calendarSchema,
  datesOfMonth,
  dayOfWeek,
  type Me,
  monthOf,
  todayInJst,
} from "@nippo/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  canMoveMonth,
  DAY_MARK_LABELS,
  type DayMark,
  dayLabelOf,
  dayLinkOf,
  dayMarkOf,
  isWeekend,
} from "./calendar";
import { useCalendarFocusDate } from "./calendar-focus";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MARKS: readonly DayMark[] = ["draft", "submitted", "returned", "approved", "missing"];
const START_COLUMNS = [
  "col-start-1",
  "col-start-2",
  "col-start-3",
  "col-start-4",
  "col-start-5",
  "col-start-6",
  "col-start-7",
] as const;

/** 置く場所ごとの色。サイドナビ(濃紺の面)と、スマートフォンのメニュー(白い面) */
const TONES = {
  sidebar: {
    text: "text-sidebar-foreground",
    muted: "text-sidebar-muted",
    holiday: "text-sidebar-holiday",
    hover: "hover:bg-sidebar-active",
    today: "ring-1 ring-sidebar-indicator ring-inset",
    focusRing: "focus-visible:ring-3 focus-visible:ring-sidebar-ring focus-visible:outline-none",
    cell: "h-8 text-xs",
    button: "size-8",
    dots: {
      draft: "bg-sidebar-status-draft",
      submitted: "bg-sidebar-status-submitted",
      returned: "bg-sidebar-status-returned",
      approved: "bg-sidebar-status-approved",
      missing: "border border-sidebar-muted",
    },
  },
  card: {
    text: "text-foreground",
    muted: "text-muted-foreground",
    holiday: "text-holiday",
    hover: "hover:bg-muted",
    today: "ring-1 ring-primary ring-inset",
    focusRing: "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
    cell: "h-11 text-sm",
    button: "size-11",
    dots: {
      draft: "bg-status-draft-foreground",
      submitted: "bg-status-submitted-foreground",
      returned: "bg-status-returned-foreground",
      approved: "bg-status-approved-foreground",
      missing: "border border-muted-foreground",
    },
  },
} as const;

type Tone = keyof typeof TONES;

const formatMonth = (month: string) => {
  const [year, mon] = month.split("-").map(Number);
  return `${year}年${mon}月`;
};

/**
 * 月のカレンダー(画面定義書 3.1)。土日祝日を赤で示し、日付を選ぶとその日の日報を開く。
 * 一般は日ごとに自分の日報のステータスを点で示す。開いている画面の日付を選択中にし、その月を表示する
 */
export function ReportCalendar({ me, tone }: { me: Me; tone: Tone }) {
  const colors = TONES[tone];
  const today = todayInJst();
  const focusDate = useCalendarFocusDate();
  const [month, setMonth] = useState(() => monthOf(focusDate ?? today));
  const isMember = me.role === "member";

  // 画面の日付が変わったら、その月を表示する
  useEffect(() => {
    if (focusDate) setMonth(monthOf(focusDate));
  }, [focusDate]);

  // キーを "reports" の下にし、日報を保存、提出、承認したとき(["reports"] の読み直し)に一緒に読み直す
  const calendar = useQuery({
    queryKey: ["reports", "calendar", month],
    queryFn: ({ signal }) =>
      api.get("/calendar", { query: { month }, schema: calendarSchema, signal }),
  });
  const days = new Map(
    calendar.data?.month === month ? calendar.data.days.map((day) => [day.date, day]) : [],
  );

  const navButton = cn(
    "flex shrink-0 items-center justify-center rounded-lg disabled:pointer-events-none disabled:opacity-40",
    colors.button,
    colors.hover,
    colors.focusRing,
  );

  return (
    <section aria-label="カレンダー" className={cn("flex flex-col gap-1", colors.text)}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="前の月"
          disabled={!canMoveMonth(month, -1)}
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className={navButton}
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
        </button>
        <h2 aria-live="polite" className="flex-1 text-center text-sm font-bold">
          {formatMonth(month)}
        </h2>
        <button
          type="button"
          aria-label="次の月"
          disabled={!canMoveMonth(month, 1)}
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className={navButton}
        >
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/* 表(table)にせず、7列のグリッドに並べる。日付の読み上げに曜日を含めるため、曜日の見出しは飾り */}
      <div aria-hidden="true" className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((weekday, i) => (
          <span
            key={weekday}
            className={cn(
              "text-center text-xs",
              i === 0 || i === 6 ? colors.holiday : colors.muted,
            )}
          >
            {weekday}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-0.5">
        {datesOfMonth(month).map((date, index) => {
          const day = days.get(date);
          const dayOff = day ? day.day_off : isWeekend(date);
          const mark = isMember && day ? dayMarkOf(day, today) : null;
          const selected = date === focusDate;
          const isToday = date === today;
          const link = dayLinkOf(me.role, date, day?.report, today);
          const label = dayLabelOf(date, { holidayName: day?.holiday_name, mark, today: isToday });
          const className = cn(
            "relative flex w-full flex-col items-center justify-center rounded-md",
            colors.cell,
            dayOff && colors.holiday,
            isToday && cn(colors.today, "font-bold"),
            selected && "bg-primary font-bold text-primary-foreground",
            link && !selected && colors.hover,
            colors.focusRing,
          );
          const content = (
            <>
              <span aria-hidden="true">{Number(date.slice(8))}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-1 size-1.5 rounded-full",
                  mark && (selected ? "bg-primary-foreground" : colors.dots[mark]),
                )}
              />
              <span className="sr-only">{label}</span>
            </>
          );
          return (
            // 1日は、その曜日の列から始める
            <li key={date} className={index === 0 ? START_COLUMNS[dayOfWeek(date)] : undefined}>
              {link ? (
                <Link
                  to={link}
                  title={label}
                  aria-current={selected ? "date" : undefined}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <span title={label} className={className}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <ul
        aria-label="カレンダーの見方"
        className={cn("flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs", colors.muted)}
      >
        <li className={colors.holiday}>赤字: 土日祝日</li>
        {isMember &&
          MARKS.map((mark) => (
            <li key={mark} className="flex items-center gap-1">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", colors.dots[mark])} />
              {DAY_MARK_LABELS[mark]}
            </li>
          ))}
      </ul>
    </section>
  );
}
