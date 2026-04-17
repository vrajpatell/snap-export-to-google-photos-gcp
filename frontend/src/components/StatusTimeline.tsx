import { cn } from "@/lib/cn";
import type { JobStatus } from "@/lib/api/types";

/**
 * Maps server statuses onto a five-step user-facing timeline.
 * "Completed" is also used for partial completion (with a warn tone).
 */
const STEPS: { id: string; label: string; statuses: JobStatus[] }[] = [
  { id: "queued", label: "Queued", statuses: ["queued"] },
  { id: "scanning", label: "Scanning", statuses: ["scanning"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "uploading", label: "Uploading", statuses: ["uploading", "paused"] },
  {
    id: "done",
    label: "Completed",
    statuses: ["completed", "partially_completed", "failed", "cancelled"],
  },
];

export function statusStepIndex(status: JobStatus | undefined): number {
  if (!status) return -1;
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

export function StatusTimeline({ status }: { status?: JobStatus }) {
  const current = statusStepIndex(status);
  const isFinal = ["completed", "partially_completed", "failed", "cancelled"].includes(
    status ?? "",
  );
  const hasIssue = status === "failed" || status === "cancelled";
  const partial = status === "partially_completed";

  return (
    <ol
      className="flex w-full items-center gap-2 overflow-x-auto pb-1"
      aria-label="Import progress timeline"
    >
      {STEPS.map((step, idx) => {
        const active = idx === current;
        const complete = idx < current || (idx === current && isFinal);
        const tone = complete
          ? hasIssue && idx === STEPS.length - 1
            ? "danger"
            : partial && idx === STEPS.length - 1
              ? "warn"
              : "success"
          : active
            ? "brand"
            : "idle";

        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-200",
                  tone === "success" &&
                    "bg-success-soft text-success border-success/30",
                  tone === "warn" && "bg-warn-soft text-warn border-warn/30",
                  tone === "danger" &&
                    "bg-danger-soft text-danger border-danger/30",
                  tone === "brand" &&
                    "bg-brand-50 text-brand-700 border-brand-200 animate-pulse-ring dark:text-brand-200",
                  tone === "idle" &&
                    "bg-surface text-ink-subtle border-border",
                )}
                aria-current={active ? "step" : undefined}
              >
                {complete && !hasIssue ? "✓" : idx + 1}
              </span>
              <span
                className={cn(
                  "truncate text-[11px] font-medium tracking-wide",
                  active ? "text-ink" : "text-ink-muted",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  "h-px flex-1 transition-colors duration-300",
                  idx < current ? "bg-brand-500/60" : "bg-border",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
