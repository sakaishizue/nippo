import { REPORT_STATUS_LABELS, type ReportStatus } from "@nippo/shared";
import { cn } from "@/lib/utils";

// 画面定義書 3.5 の日報のステータスの色。色だけで区別せず、必ず文字を添える
const COLORS: Record<ReportStatus, string> = {
  draft: "bg-status-draft text-status-draft-foreground",
  submitted: "bg-status-submitted text-status-submitted-foreground",
  returned: "bg-status-returned text-status-returned-foreground",
  approved: "bg-status-approved text-status-approved-foreground",
};

/** 日報のステータスの色付きラベル(SCR-02、SCR-03、SCR-05) */
export function ReportStatusLabel({ status }: { status: ReportStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 text-xs leading-6 font-bold whitespace-nowrap",
        COLORS[status],
      )}
    >
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}
