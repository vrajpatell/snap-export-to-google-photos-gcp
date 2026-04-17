import { cn } from "@/lib/cn";

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  tone?: "brand" | "success" | "warn" | "danger";
  indeterminate?: boolean;
  className?: string;
  showPercent?: boolean;
}

const toneClasses = {
  brand: "bg-gradient-to-r from-brand-500 to-brand-600",
  success: "bg-gradient-to-r from-emerald-400 to-emerald-500",
  warn: "bg-gradient-to-r from-amber-400 to-amber-500",
  danger: "bg-gradient-to-r from-rose-400 to-rose-500",
} as const;

export function Progress({
  value,
  max = 100,
  label,
  tone = "brand",
  indeterminate,
  className,
  showPercent = true,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercent) && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-ink-muted">
          {label ? <span>{label}</span> : <span />}
          {showPercent && !indeterminate ? (
            <span className="tabular font-medium text-ink">
              {pct.toFixed(0)}%
            </span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate ? undefined : Math.round(pct)}
        aria-label={label ?? "progress"}
        className="relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border"
      >
        {indeterminate ? (
          <div
            className={cn(
              "absolute inset-y-0 left-0 w-1/3 rounded-full",
              toneClasses[tone],
              "animate-progress-indeterminate",
            )}
          />
        ) : (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-swift",
              toneClasses[tone],
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}
