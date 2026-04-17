import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton h-4 w-full", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
