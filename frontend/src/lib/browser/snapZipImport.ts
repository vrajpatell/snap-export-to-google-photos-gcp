import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

import type { JobResponse, JobStatus } from "../api/types";
import { createMediaItem, uploadMediaBytes } from "./googlePhotos";

const DEDUPE_KEY = "snap-export-google-photos.browser-dedupe.v1";

interface ZipEntryLike {
  filename: string;
  directory?: boolean;
  uncompressedSize?: number;
  lastModDate?: Date;
  getData?: (writer: BlobWriter) => Promise<Blob>;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

export interface BrowserImportReportRow {
  path: string;
  status: "uploaded" | "skipped" | "failed";
  message?: string;
  mediaItemId?: string;
  productUrl?: string;
  bytes?: number;
}

export interface BrowserImportResult {
  job: JobResponse;
  reportRows: BrowserImportReportRow[];
}

export interface RunBrowserImportOptions {
  file: File;
  accessToken: string;
  onJob?: (job: JobResponse) => void;
  onReportRow?: (row: BrowserImportReportRow) => void;
  shouldCancel?: () => boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function extensionFor(path: string): string {
  const basename = path.split("/").pop() || path;
  const dotIndex = basename.lastIndexOf(".");
  return dotIndex === -1 ? "" : basename.slice(dotIndex + 1).toLowerCase();
}

function basenameFor(path: string): string {
  return path.split("/").filter(Boolean).pop() || "snap-media";
}

function mimeFor(path: string): string | undefined {
  return MIME_BY_EXTENSION[extensionFor(path)];
}

function isMacMetadata(path: string): boolean {
  const parts = path.split("/");
  return path.startsWith("__MACOSX/") || parts.some((part) => part.startsWith("._"));
}

function fingerprintFor(entry: ZipEntryLike): string {
  const modified = entry.lastModDate?.toISOString?.() ?? "unknown-date";
  return `${entry.filename}|${entry.uncompressedSize ?? 0}|${modified}`;
}

function loadDedupe(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DEDUPE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveDedupe(dedupe: Set<string>): void {
  try {
    const values = Array.from(dedupe);
    window.localStorage.setItem(DEDUPE_KEY, JSON.stringify(values.slice(-50000)));
  } catch {
    // Local storage can be unavailable in private browsing or full profiles.
  }
}

function makeJob(file: File): JobResponse {
  const created = nowIso();
  return {
    job_id: `browser-${created}-${Math.random().toString(36).slice(2, 10)}`,
    status: "queued",
    source_uri: file.name,
    source_type: "browser-local-zip",
    created_at: created,
    updated_at: created,
    counters: {
      total_discovered: 0,
      supported_files: 0,
      unsupported_count: 0,
      uploaded_count: 0,
      created_count: 0,
      failed_count: 0,
      skipped_duplicates: 0,
      bytes_processed: 0,
    },
  };
}

function terminalStatus(failed: number, uploaded: number, cancelled: boolean): JobStatus {
  if (cancelled) return "cancelled";
  if (failed > 0 && uploaded > 0) return "partially_completed";
  if (failed > 0) return "failed";
  return "completed";
}

export async function runBrowserImport({
  file,
  accessToken,
  onJob,
  onReportRow,
  shouldCancel,
}: RunBrowserImportOptions): Promise<BrowserImportResult> {
  let job = makeJob(file);
  const reportRows: BrowserImportReportRow[] = [];
  const dedupe = loadDedupe();

  const publish = (status?: JobStatus): void => {
    job = {
      ...job,
      status: status ?? job.status,
      updated_at: nowIso(),
      counters: { ...job.counters },
    };
    onJob?.(job);
  };

  const report = (row: BrowserImportReportRow): void => {
    reportRows.push(row);
    onReportRow?.(row);
  };

  publish("queued");

  if (file.size > 2 * 1024 * 1024 * 1024) {
    report({
      path: file.name,
      status: "skipped",
      message: "Very large ZIP selected. Keep the device awake and consider splitting exports larger than 2 GB if the browser becomes slow or runs out of memory.",
      bytes: file.size,
    });
  }

  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = (await reader.getEntries()) as ZipEntryLike[];
    const fileEntries = entries.filter((entry) => !entry.directory && !isMacMetadata(entry.filename));
    const supportedEntries = fileEntries.filter((entry) => Boolean(mimeFor(entry.filename)));

    job = {
      ...job,
      status: "uploading",
      counters: {
        ...job.counters,
        total_discovered: fileEntries.length,
        supported_files: supportedEntries.length,
        unsupported_count: fileEntries.length - supportedEntries.length,
      },
    };
    for (const entry of fileEntries) {
      if (!mimeFor(entry.filename)) {
        report({
          path: entry.filename,
          status: "skipped",
          message: `Unsupported file type: .${extensionFor(entry.filename) || "no extension"}`,
          bytes: entry.uncompressedSize ?? 0,
        });
      }
    }
    publish("uploading");

    if (supportedEntries.length === 0) {
      publish("failed");
      return { job, reportRows };
    }

    for (const entry of supportedEntries) {
      if (shouldCancel?.()) {
        publish("cancelled");
        return { job, reportRows };
      }

      const fingerprint = fingerprintFor(entry);
      const size = entry.uncompressedSize ?? 0;
      if (dedupe.has(fingerprint)) {
        job.counters.skipped_duplicates += 1;
        job.counters.bytes_processed += size;
        report({
          path: entry.filename,
          status: "skipped",
          message: "Already imported from this browser profile.",
          bytes: size,
        });
        publish("uploading");
        continue;
      }

      try {
        const mime = mimeFor(entry.filename) || "application/octet-stream";
        const blob = await entry.getData?.(new BlobWriter(mime));
        if (!blob) {
          throw new Error("Could not extract ZIP entry in the browser.");
        }

        const filename = basenameFor(entry.filename);
        const uploadToken = await uploadMediaBytes(accessToken, blob, filename);
        const created = await createMediaItem(
          accessToken,
          uploadToken,
          filename,
          `Imported from Snapchat export: ${entry.filename}`,
        );

        dedupe.add(fingerprint);
        saveDedupe(dedupe);
        job.counters.uploaded_count += 1;
        job.counters.created_count = (job.counters.created_count ?? 0) + 1;
        job.counters.bytes_processed += size;
        report({
          path: entry.filename,
          status: "uploaded",
          mediaItemId: created.mediaItemId,
          productUrl: created.productUrl,
          bytes: size,
        });
      } catch (error) {
        job.counters.failed_count += 1;
        job.counters.bytes_processed += size;
        report({
          path: entry.filename,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
          bytes: size,
        });
      }

      publish("uploading");
    }

    publish(terminalStatus(job.counters.failed_count, job.counters.uploaded_count, false));
    return { job, reportRows };
  } finally {
    await reader.close();
  }
}
