import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl",
        "border border-dashed border-border bg-surface/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-300">
          {icon}
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
