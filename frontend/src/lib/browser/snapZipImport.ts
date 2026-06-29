import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js";

import type { JobResponse, JobStatus } from "@/features/jobs/types";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { createMediaItems, GooglePhotosBrowserError, uploadMediaBytes, uploadMediaBytesResumable } from "./googlePhotos";
import { hashFingerprint, sha256Blob } from "./hash";
import { createImportSession, markHashCompleted, getCompletedHash, updateImportSession, upsertMediaItem, type MediaItemRecord, loadSessionReport } from "./importDb";
import { categoryForMime, extensionFor, inspectMediaBlob, isSupportedMime } from "./mediaQuality";
import { BATCH_CREATE_SIZE, DEFAULT_UPLOAD_CONCURRENCY, RESUMABLE_UPLOAD_THRESHOLD_BYTES, chunk, isRetryableStatus, retry, runWithConcurrency } from "./uploadQueue";

interface ZipEntryLike { filename: string; directory?: boolean; uncompressedSize?: number; lastModDate?: Date; getData?: (writer: BlobWriter) => Promise<Blob>; }

export interface BrowserImportReportRow {
  path: string; status: "uploaded" | "skipped" | "failed"; message?: string; mediaItemId?: string; productUrl?: string; bytes?: number;
  filename?: string; extension?: string; detectedMime?: string; sha256?: string; duplicate?: boolean; uploadMode?: "raw" | "resumable"; attempts?: number; qualityWarnings?: string[]; exifDate?: string; width?: number; height?: number; retryable?: boolean;
}
export interface BrowserImportResult { job: JobResponse; reportRows: BrowserImportReportRow[]; }
export interface RunBrowserImportOptions { file: File; accessToken: string; onJob?: (job: JobResponse) => void; onReportRow?: (row: BrowserImportReportRow) => void; shouldCancel?: () => boolean; resumeSessionId?: string; }

function nowIso(): string { return new Date().toISOString(); }
function basenameFor(path: string): string { return path.split("/").filter(Boolean).pop() || "snap-media"; }
function isMacMetadata(path: string): boolean { const parts = path.split("/"); return path.startsWith("__MACOSX/") || parts.some((part) => part.startsWith("._")); }
function makeId(path: string): string { return `${Date.now()}-${path.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}-${Math.random().toString(36).slice(2, 8)}`; }
function retryableFrom(error: unknown): boolean { return error instanceof GooglePhotosBrowserError ? isRetryableStatus(error.status) : true; }

function makeJob(sessionId: string, file: File): JobResponse { const created = nowIso(); return { job_id: sessionId, status: "queued", source_uri: file.name, source_type: "browser-local-zip", created_at: created, updated_at: created, counters: { total_discovered: 0, supported_files: 0, unsupported_count: 0, uploaded_count: 0, created_count: 0, failed_count: 0, skipped_duplicates: 0, bytes_processed: 0 } }; }
function terminalStatus(failed: number, created: number, cancelled: boolean): JobStatus { if (cancelled) return "cancelled"; if (failed > 0 && created > 0) return "partially_completed"; if (failed > 0) return "failed"; return "completed"; }

export async function runBrowserImport({ file, accessToken, onJob, onReportRow, shouldCancel, resumeSessionId }: RunBrowserImportOptions): Promise<BrowserImportResult> {
  const startedAt = performance.now();
  const session = resumeSessionId ? { id: resumeSessionId } : await createImportSession({ sourceFileName: file.name, sourceFileSize: file.size });
  let job = makeJob(session.id, file);
  const reportRows: BrowserImportReportRow[] = [];
  const publish = (status?: JobStatus): void => { job = { ...job, status: status ?? job.status, updated_at: nowIso(), counters: { ...job.counters } }; onJob?.(job); const dbStatus = job.status === "queued" ? "created" : job.status; void updateImportSession(job.job_id, { status: dbStatus, counters: { totalDiscovered: job.counters.total_discovered, supportedFiles: job.counters.supported_files, unsupportedCount: job.counters.unsupported_count, duplicateCount: job.counters.skipped_duplicates, uploadedCount: job.counters.uploaded_count, createdCount: job.counters.created_count ?? 0, failedCount: job.counters.failed_count, bytesProcessed: job.counters.bytes_processed, bytesTotal: file.size } }); };
  const report = (row: BrowserImportReportRow): void => { reportRows.push(row); onReportRow?.(row); };

  logInfo(resumeSessionId ? "resume.session_started" : "import.scan_started", { component: "snapZipImport", metadata: { jobId: job.job_id, fileSize: file.size } });
  publish("queued");
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = (await reader.getEntries()) as ZipEntryLike[];
    const fileEntries = entries.filter((entry) => !entry.directory && !isMacMetadata(entry.filename));
    job.counters.total_discovered = fileEntries.length;
    logInfo("import.scan_finished", { component: "snapZipImport", metadata: { fileEntries: fileEntries.length } });

    const uploaded: Array<MediaItemRecord & { uploadToken: string }> = [];
    await runWithConcurrency(fileEntries, DEFAULT_UPLOAD_CONCURRENCY, async (entry, index) => {
      const size = entry.uncompressedSize ?? 0;
      const fileName = basenameFor(entry.filename);
      const base: MediaItemRecord = { id: makeId(entry.filename), sessionId: job.job_id, zipPath: entry.filename, fileName, extension: extensionFor(entry.filename), size, status: "extracting", attempts: 0, createdAt: nowIso(), updatedAt: nowIso() };
      if (shouldCancel?.()) { await upsertMediaItem({ ...base, status: "cancelled" }); return; }
      try {
        const blob = await entry.getData?.(new BlobWriter());
        if (!blob) throw new Error("Could not extract ZIP entry in the browser.");
        const quality = await inspectMediaBlob(blob, fileName);
        const record = { ...base, ...quality, detectedMime: quality.detectedMime, category: quality.category, qualityWarnings: quality.warnings };
        logInfo("import.mime_detected", { component: "snapZipImport", metadata: { index: index + 1, extension: record.extension, detectedMime: record.detectedMime, category: record.category } });
        quality.warnings.forEach(() => logWarn("import.quality_warning", { component: "snapZipImport", metadata: { index: index + 1, extension: record.extension } }));
        if (!isSupportedMime(record.detectedMime)) {
          job.counters.unsupported_count += 1; job.counters.bytes_processed += size;
          await upsertMediaItem({ ...record, status: "unsupported", error: "Unsupported media type.", retryable: false });
          report({ path: entry.filename, status: "skipped", message: "Unsupported media type.", bytes: size, filename: fileName, extension: record.extension, detectedMime: record.detectedMime, qualityWarnings: quality.warnings, retryable: false });
          publish("uploading"); return;
        }
        job.counters.supported_files += 1;
        logInfo("import.hash_started", { component: "snapZipImport", metadata: { index: index + 1, bytes: size } });
        const sha256 = await sha256Blob(blob);
        logInfo("import.hash_finished", { component: "snapZipImport", metadata: { index: index + 1, bytes: size } });
        const fingerprint = hashFingerprint(sha256, size, record.detectedMime);
        if (await getCompletedHash(fingerprint)) {
          job.counters.skipped_duplicates += 1; job.counters.bytes_processed += size;
          await upsertMediaItem({ ...record, sha256, status: "duplicate", duplicate: true, retryable: false });
          logInfo("import.duplicate_detected", { component: "snapZipImport", metadata: { index: index + 1, extension: record.extension, bytes: size } });
          report({ path: entry.filename, status: "skipped", message: "Already imported from this browser profile.", bytes: size, filename: fileName, extension: record.extension, detectedMime: record.detectedMime, sha256, duplicate: true, qualityWarnings: quality.warnings });
          publish("uploading"); return;
        }
        const uploadMode = blob.size >= RESUMABLE_UPLOAD_THRESHOLD_BYTES || categoryForMime(record.detectedMime) === "video" ? "resumable" : "raw";
        await upsertMediaItem({ ...record, sha256, status: "uploading", uploadMode, attempts: 1 });
        logInfo(uploadMode === "raw" ? "upload.raw_started" : "upload.resumable_started", { component: "snapZipImport", metadata: { index: index + 1, bytes: blob.size, mime: record.detectedMime } });
        const uploadToken = await retry(() => uploadMode === "raw" ? uploadMediaBytes(accessToken, new Blob([blob], { type: record.detectedMime }), fileName) : uploadMediaBytesResumable(accessToken, new Blob([blob], { type: record.detectedMime }), fileName, { contentType: record.detectedMime }), { isRetryable: retryableFrom, onRetry: (error, attempt, delayMs) => logWarn("upload.retry_scheduled", { component: "snapZipImport", metadata: { attempt, delayMs, retryable: retryableFrom(error) } }) });
        job.counters.uploaded_count += 1; job.counters.bytes_processed += size;
        const done = { ...record, sha256, status: "uploaded" as const, uploadMode, uploadToken, attempts: 1 };
        await upsertMediaItem(done);
        uploaded.push({ ...done, uploadToken });
        logInfo(uploadMode === "raw" ? "upload.raw_finished" : "upload.resumable_finished", { component: "snapZipImport", metadata: { index: index + 1, bytes: blob.size } });
        publish("uploading");
      } catch (error) {
        job.counters.failed_count += 1; job.counters.bytes_processed += size;
        const retryable = retryableFrom(error);
        await upsertMediaItem({ ...base, status: "failed", error: error instanceof Error ? error.message : String(error), retryable, attempts: 1 });
        logError("import.media_item_failed", error, { component: "snapZipImport", metadata: { index: index + 1, bytes: size, retryable } });
        report({ path: entry.filename, status: "failed", message: error instanceof Error ? error.message : String(error), bytes: size, filename: fileName, extension: base.extension, retryable });
        publish("uploading");
      }
    });

    if (shouldCancel?.()) { publish("cancelled"); return { job, reportRows: await loadSessionReport(job.job_id) }; }
    logInfo("upload.queue_finished", { component: "snapZipImport", metadata: { uploaded: uploaded.length } });
    for (const batch of chunk(uploaded, BATCH_CREATE_SIZE)) {
      logInfo("batch_create.started", { component: "snapZipImport", metadata: { itemCount: batch.length } });
      const results = await createMediaItems(accessToken, batch.map((item) => ({ uploadToken: item.uploadToken, filename: item.fileName })));
      for (const [i, result] of results.entries()) {
        const item = batch[i];
        if (result.error) { job.counters.failed_count += 1; await upsertMediaItem({ ...item, status: "failed", error: result.error, retryable: false }); report({ path: item.zipPath, status: "failed", message: result.error, bytes: item.size, filename: item.fileName, extension: item.extension, detectedMime: item.detectedMime, sha256: item.sha256, uploadMode: item.uploadMode, attempts: item.attempts, qualityWarnings: item.qualityWarnings, retryable: false }); }
        else { job.counters.created_count = (job.counters.created_count ?? 0) + 1; await upsertMediaItem({ ...item, status: "created", mediaItemId: result.mediaItemId, productUrl: result.productUrl }); if (item.sha256) await markHashCompleted({ fingerprint: hashFingerprint(item.sha256, item.size, item.detectedMime), sha256: item.sha256, size: item.size, detectedMime: item.detectedMime, completedAt: nowIso(), mediaItemId: result.mediaItemId }); report({ path: item.zipPath, status: "uploaded", mediaItemId: result.mediaItemId, productUrl: result.productUrl, bytes: item.size, filename: item.fileName, extension: item.extension, detectedMime: item.detectedMime, sha256: item.sha256, uploadMode: item.uploadMode, attempts: item.attempts, qualityWarnings: item.qualityWarnings, exifDate: item.exifDate, width: item.width, height: item.height }); }
      }
      publish("uploading");
      logInfo("batch_create.finished", { component: "snapZipImport", metadata: { itemCount: batch.length } });
    }
    publish(terminalStatus(job.counters.failed_count, job.counters.created_count ?? 0, false));
    logInfo("import.job_finished", { component: "snapZipImport", metadata: { status: job.status, counters: job.counters, durationMs: Math.round(performance.now() - startedAt) } });
    return { job, reportRows };
  } catch (error) { logError("import.job_unhandled_error", error, { component: "snapZipImport" }); throw error; }
  finally { await reader.close(); }
}
