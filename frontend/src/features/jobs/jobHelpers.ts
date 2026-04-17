import type { BadgeTone } from "@/components/ui/Badge";
import type { JobCounters, JobResponse, JobStatus } from "@/lib/api/types";

export const TERMINAL_STATUSES: JobStatus[] = [
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
];

export function isTerminal(status?: JobStatus): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

export function isActive(status?: JobStatus): boolean {
  return !!status && !isTerminal(status);
}

export function isUploadingLike(status?: JobStatus): boolean {
  return status === "uploading";
}

export interface ActionAvailability {
  start: boolean;
  pause: boolean;
  resume: boolean;
  cancel: boolean;
}

/**
 * Returns which control actions are available for a given job status.
 * Centralizing this logic makes it testable and keeps buttons consistent.
 */
export function availableActions(status?: JobStatus): ActionAvailability {
  if (!status) {
    return { start: false, pause: false, resume: false, cancel: false };
  }
  switch (status) {
    case "queued":
    case "scanning":
      return { start: false, pause: false, resume: false, cancel: true };
    case "ready":
      return { start: true, pause: false, resume: false, cancel: true };
    case "uploading":
      return { start: false, pause: true, resume: false, cancel: true };
    case "paused":
      return { start: false, pause: false, resume: true, cancel: true };
    default:
      return { start: false, pause: false, resume: false, cancel: false };
  }
}

export function progressPercent(counters?: JobCounters): number {
  if (!counters) return 0;
  const total = counters.supported_files;
  if (!total || total <= 0) return 0;
  const done = counters.uploaded_count + counters.skipped_duplicates;
  return Math.min(100, Math.max(0, (done / total) * 100));
}

export const STATUS_BADGE_TONE: Record<JobStatus, BadgeTone> = {
  queued: "neutral",
  scanning: "info",
  ready: "info",
  uploading: "brand",
  paused: "warn",
  completed: "success",
  partially_completed: "warn",
  failed: "danger",
  cancelled: "neutral",
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  scanning: "Scanning",
  ready: "Ready",
  uploading: "Uploading",
  paused: "Paused",
  completed: "Completed",
  partially_completed: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function summarize(job: JobResponse): {
  tone: BadgeTone;
  title: string;
  message: string;
} {
  const { counters, status } = job;
  switch (status) {
    case "completed":
      return {
        tone: "success",
        title: "Import complete",
        message: `Uploaded ${counters.uploaded_count.toLocaleString()} items to your Google Photos library.`,
      };
    case "partially_completed":
      return {
        tone: "warn",
        title: "Import finished with issues",
        message: `Uploaded ${counters.uploaded_count.toLocaleString()} of ${counters.supported_files.toLocaleString()}. Review the report for skipped or failed items.`,
      };
    case "failed":
      return {
        tone: "danger",
        title: "Import failed",
        message:
          "The import stopped unexpectedly. Download the report for diagnostic details, then retry.",
      };
    case "cancelled":
      return {
        tone: "neutral",
        title: "Import cancelled",
        message: "You cancelled this import. No further changes were made.",
      };
    default:
      return {
        tone: "info",
        title: STATUS_LABEL[status],
        message: "Import in progress.",
      };
  }
}
