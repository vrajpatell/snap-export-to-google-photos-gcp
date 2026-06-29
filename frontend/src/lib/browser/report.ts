import type { JobResponse } from "@/features/jobs/types";
import type { BrowserImportReportRow } from "./snapZipImport";

function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsvReport(rows: BrowserImportReportRow[]): string {
  const header = ["path", "filename", "extension", "bytes", "detectedMime", "sha256", "status", "duplicate", "uploadMode", "attempts", "qualityWarnings", "exifDate", "width", "height", "mediaItemId", "productUrl", "message", "retryable"];
  const lines = rows.map((row) =>
    [row.path, row.filename, row.extension, row.bytes, row.detectedMime, row.sha256, row.status, row.duplicate ? "yes" : "no", row.uploadMode, row.attempts, row.qualityWarnings?.join("; "), row.exifDate, row.width, row.height, row.mediaItemId, row.productUrl, row.message, row.retryable == null ? "" : row.retryable ? "yes" : "no"]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function buildJsonReport(job: JobResponse, rows: BrowserImportReportRow[]): string {
  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      execution_mode: "browser-local",
      job,
      rows,
    },
    null,
    2,
  );
}

export function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
