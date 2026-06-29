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
        "surface-card interactive-card animate-fade-in p-6 sm:p-7",
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
      <div className="space-y-2">
        {eyebrow ? (
          <div className="inline-flex rounded-full border border-brand-200/70 bg-brand-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700 dark:border-brand-400/20 dark:bg-brand-500/10 dark:text-brand-200">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-xl font-bold leading-tight tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-prose text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
