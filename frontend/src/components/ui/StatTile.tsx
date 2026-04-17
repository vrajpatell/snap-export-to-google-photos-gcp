import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useAnimatedNumber } from "@/lib/useAnimatedNumber";
import { formatNumber } from "@/lib/format";

export interface StatTileProps {
  label: string;
  value: number;
  /** Render the value using this formatter instead of the default locale formatter. */
  format?: (n: number) => string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warn" | "danger" | "brand";
  hint?: ReactNode;
  className?: string;
}

const toneRing: Record<NonNullable<StatTileProps["tone"]>, string> = {
  neutral: "bg-surface",
  brand: "bg-brand-50 text-brand-700 dark:text-brand-200",
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

export function StatTile({
  label,
  value,
  format = formatNumber,
  icon,
  tone = "neutral",
  hint,
  className,
}: StatTileProps) {
  const animated = useAnimatedNumber(value);
  return (
    <div className={cn("stat-tile", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-lg",
              toneRing[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular">
        {format(Math.round(animated * 100) / 100)}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}
