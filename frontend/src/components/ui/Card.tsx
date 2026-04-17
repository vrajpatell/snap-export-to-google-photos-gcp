import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "surface-card animate-fade-in p-6 sm:p-7",
        "transition-shadow duration-200 ease-swift",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-lg font-semibold leading-tight text-ink sm:text-xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-sm text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
