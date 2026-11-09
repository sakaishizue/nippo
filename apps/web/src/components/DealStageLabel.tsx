import { DEAL_STAGE_LABELS, type DealStage } from "@nippo/shared";
import { cn } from "@/lib/utils";

/** 商談のステージのラベル。受注は完了の色、失注は薄い色、それ以外は淡い基本色 */
export function DealStageLabel({ stage }: { stage: DealStage }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 text-xs leading-6 font-bold whitespace-nowrap",
        stage === "won"
          ? "bg-success-surface text-success"
          : stage === "lost"
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground",
      )}
    >
      {DEAL_STAGE_LABELS[stage]}
    </span>
  );
}
