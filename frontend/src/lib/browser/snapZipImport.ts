import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

import type { JobResponse, JobStatus } from "@/features/jobs/types";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
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
    logInfo("dedupe.loaded", {
      component: "snapZipImport",
      metadata: { entries: parsed.length },
    });
    return new Set(parsed);
  } catch (error) {
    logWarn("dedupe.load_failed", {
      component: "snapZipImport",
      message: error instanceof Error ? error.message : String(error),
    });
    return new Set();
  }
}

function saveDedupe(dedupe: Set<string>): void {
  try {
    const values = Array.from(dedupe);
    window.localStorage.setItem(DEDUPE_KEY, JSON.stringify(values.slice(-50000)));
    logInfo("dedupe.saved", {
      component: "snapZipImport",
      metadata: { entries: values.length },
    });
  } catch (error) {
    logWarn("dedupe.save_failed", {
      component: "snapZipImport",
      message: error instanceof Error ? error.message : String(error),
    });
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
  const startedAt = performance.now();
  let job = makeJob(file);
  const reportRows: BrowserImportReportRow[] = [];
  const dedupe = loadDedupe();

  logInfo("import.job_created", {
    component: "snapZipImport",
    metadata: {
      jobId: job.job_id,
      fileSize: file.size,
      fileType: file.type || "unknown",
      extension: extensionFor(file.name) || "none",
    },
  });

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
    logWarn("import.large_zip_selected", {
      component: "snapZipImport",
      metadata: { fileSize: file.size },
    });
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
    logInfo("import.zip_scanned", {
      component: "snapZipImport",
      metadata: {
        totalEntries: entries.length,
        fileEntries: fileEntries.length,
        supportedEntries: supportedEntries.length,
        unsupportedEntries: fileEntries.length - supportedEntries.length,
      },
    });

    for (const entry of fileEntries) {
      if (!mimeFor(entry.filename)) {
        const extension = extensionFor(entry.filename) || "none";
        logWarn("import.unsupported_file_skipped", {
          component: "snapZipImport",
          metadata: {
            extension,
            bytes: entry.uncompressedSize ?? 0,
          },
        });
        report({
          path: entry.filename,
          status: "skipped",
          message: `Unsupported file type: .${extension}`,
          bytes: entry.uncompressedSize ?? 0,
        });
      }
    }
    publish("uploading");

    if (supportedEntries.length === 0) {
      logWarn("import.no_supported_media", {
        component: "snapZipImport",
        metadata: { totalDiscovered: fileEntries.length },
      });
      publish("failed");
      return { job, reportRows };
    }

    for (const [index, entry] of supportedEntries.entries()) {
      if (shouldCancel?.()) {
        logWarn("import.cancelled", {
          component: "snapZipImport",
          metadata: {
            processed: index,
            counters: job.counters,
          },
        });
        publish("cancelled");
        return { job, reportRows };
      }

      const fingerprint = fingerprintFor(entry);
      const size = entry.uncompressedSize ?? 0;
      const extension = extensionFor(entry.filename) || "none";
      if (dedupe.has(fingerprint)) {
        job.counters.skipped_duplicates += 1;
        job.counters.bytes_processed += size;
        logInfo("import.duplicate_skipped", {
          component: "snapZipImport",
          metadata: {
            index: index + 1,
            total: supportedEntries.length,
            extension,
            bytes: size,
          },
        });
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
        const itemStartedAt = performance.now();
        logInfo("import.media_item_started", {
          component: "snapZipImport",
          metadata: {
            index: index + 1,
            total: supportedEntries.length,
            extension,
            mime,
            bytes: size,
          },
        });
        const blob = await entry.getData?.(new BlobWriter(mime));
        if (!blob) {
          throw new Error("Could not extract ZIP entry in the browser.");
        }

        const filename = basenameFor(entry.filename);
        const uploadToken = await uploadMediaBytes(accessToken, blob, filename);
        const created = await createMediaItem(accessToken, uploadToken, filename);

        dedupe.add(fingerprint);
        saveDedupe(dedupe);
        job.counters.uploaded_count += 1;
        job.counters.created_count = (job.counters.created_count ?? 0) + 1;
        job.counters.bytes_processed += size;
        logInfo("import.media_item_uploaded", {
          component: "snapZipImport",
          metadata: {
            index: index + 1,
            total: supportedEntries.length,
            extension,
            mime,
            bytes: size,
            durationMs: Math.round(performance.now() - itemStartedAt),
          },
        });
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
        logError("import.media_item_failed", error, {
          component: "snapZipImport",
          metadata: {
            index: index + 1,
            total: supportedEntries.length,
            extension,
            bytes: size,
          },
        });
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
    logInfo("import.job_finished", {
      component: "snapZipImport",
      metadata: {
        status: job.status,
        counters: job.counters,
        durationMs: Math.round(performance.now() - startedAt),
      },
    });
    return { job, reportRows };
  } catch (error) {
    logError("import.job_unhandled_error", error, {
      component: "snapZipImport",
      metadata: {
        counters: job.counters,
        durationMs: Math.round(performance.now() - startedAt),
      },
    });
    throw error;
  } finally {
    await reader.close();
    logInfo("import.zip_reader_closed", {
      component: "snapZipImport",
      metadata: { durationMs: Math.round(performance.now() - startedAt) },
    });
  }
}
