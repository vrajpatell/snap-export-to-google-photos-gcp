import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warn"
  | "danger"
  | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    "bg-surface text-ink-muted border border-border",
  brand:
    "bg-brand-50 text-brand-700 border border-brand-200 dark:text-brand-200 dark:border-brand-400/30",
  success:
    "bg-success-soft text-success border border-success/30",
  warn: "bg-warn-soft text-warn border border-warn/30",
  danger:
    "bg-danger-soft text-danger border border-danger/30",
  info: "bg-brand-50 text-brand-700 border border-brand-200 dark:text-brand-200 dark:border-brand-400/30",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  leading?: ReactNode;
  pulse?: boolean;
}

export function Badge({
  tone = "neutral",
  leading,
  pulse,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        "transition-colors duration-150 ease-swift",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {pulse ? (
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full bg-current",
            "animate-pulse-ring",
          )}
          aria-hidden="true"
        />
      ) : null}
      {leading}
      {children}
    </span>
  );
}
