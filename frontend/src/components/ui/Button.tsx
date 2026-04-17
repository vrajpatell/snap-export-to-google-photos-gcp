import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leading?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl select-none " +
  "transition-all duration-150 ease-swift disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft hover:bg-brand-700 hover:shadow-lift " +
    "disabled:hover:bg-brand-600 disabled:hover:shadow-soft",
  secondary:
    "bg-surface-raised text-ink border border-border hover:border-border-strong " +
    "hover:bg-surface",
  ghost:
    "bg-transparent text-ink-muted hover:text-ink hover:bg-surface " +
    "border border-transparent",
  subtle:
    "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:text-brand-200",
  danger:
    "bg-danger text-white hover:brightness-110 shadow-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      leading,
      trailing,
      loading,
      fullWidth,
      className,
      children,
      disabled,
      ...props
    },
    ref,
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        className={cn(
          base,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className,
        )}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Spinner />
        ) : leading ? (
          <span className="shrink-0">{leading}</span>
        ) : null}
        <span className="truncate">{children}</span>
        {!loading && trailing ? (
          <span className="shrink-0">{trailing}</span>
        ) : null}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}
