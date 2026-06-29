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
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden font-semibold rounded-2xl select-none " +
  "transition-all duration-300 ease-swift disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised active:scale-[0.97]";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-brand-500 via-brand-600 to-indigo-500 text-white shadow-lift " +
    "before:absolute before:inset-0 before:-translate-x-full before:bg-white/20 before:transition-transform before:duration-700 hover:before:translate-x-0 " +
    "hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-20px_rgb(20_184_166_/_0.75)]",
  secondary:
    "border border-white/70 bg-white/80 text-ink shadow-soft backdrop-blur-xl hover:-translate-y-0.5 hover:border-brand-200 hover:bg-white dark:border-white/10 dark:bg-surface/80 dark:hover:bg-surface-raised",
  ghost:
    "bg-transparent text-ink-muted hover:bg-white/70 hover:text-ink dark:hover:bg-white/10 border border-transparent",
  subtle:
    "bg-brand-50/90 text-brand-700 hover:-translate-y-0.5 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20",
  danger:
    "bg-danger text-white shadow-soft hover:-translate-y-0.5 hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-sm",
  lg: "min-h-[3.25rem] px-6 py-3.5 text-[15px]",
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
          <span className="relative z-10 shrink-0 transition-transform duration-300 group-hover:scale-110">{leading}</span>
        ) : null}
        <span className="relative z-10 truncate">{children}</span>
        {!loading && trailing ? (
          <span className="relative z-10 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5">{trailing}</span>
        ) : null}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="relative z-10 h-4 w-4 animate-spin"
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
