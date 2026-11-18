import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** カードの見出し(h2)。淡い基本色の四角にアイコンを添える。アイコンは飾り */
export function SectionHeading({
  id,
  icon: Icon,
  children,
  className,
}: {
  id?: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn("flex items-center gap-2.5 text-base font-bold md:text-lg", className)}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"
      >
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </h2>
  );
}
