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
  const header = ["path", "status", "message", "mediaItemId", "productUrl", "bytes"];
  const lines = rows.map((row) =>
    [row.path, row.status, row.message, row.mediaItemId, row.productUrl, row.bytes]
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
