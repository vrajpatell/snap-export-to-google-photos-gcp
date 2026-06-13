import type { BadgeTone } from "@/components/ui/Badge";
import type { JobCounters, JobResponse, JobStatus } from "./types";

export const TERMINAL_STATUSES: JobStatus[] = [
  "completed",
  "partially_completed",
  "failed",
  "cancelled",
];

export function isTerminal(status?: JobStatus): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
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
  uploading: "brand",
  completed: "success",
  partially_completed: "warn",
  failed: "danger",
  cancelled: "neutral",
};

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  uploading: "Uploading",
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
        message: `Uploaded ${counters.uploaded_count.toLocaleString()} of ${counters.supported_files.toLocaleString()}. Review the local report for skipped or failed items.`,
      };
    case "failed":
      return {
        tone: "danger",
        title: "Import failed",
        message:
          "The browser import stopped unexpectedly. Download the local report for diagnostic details, then retry.",
      };
    case "cancelled":
      return {
        tone: "neutral",
        title: "Import cancelled",
        message: "You cancelled this browser import. Files already created in Google Photos were not removed.",
      };
    default:
      return {
        tone: "info",
        title: STATUS_LABEL[status],
        message: "Import in progress. Keep this browser tab open.",
      };
  }
}
