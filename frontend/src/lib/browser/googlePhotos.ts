import { logError, logInfo, logWarn } from "@/lib/observability/logger";

const UPLOAD_ENDPOINT = "https://photoslibrary.googleapis.com/v1/uploads";
const BATCH_CREATE_ENDPOINT =
  "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const TARGET_CHUNK_SIZE = 8 * 1024 * 1024;
const MIN_RATE_LIMIT_DELAY_MS = 30_000;

export class GooglePhotosBrowserError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GooglePhotosBrowserError";
  }
}

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isGooglePhotosRetryableStatus(status?: number): boolean {
  return status == null || RETRYABLE_STATUSES.has(status);
}

export function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.max(
      response?.status === 429 ? MIN_RATE_LIMIT_DELAY_MS : 0,
      retryAfterSeconds * 1000,
    );
  }
  if (response?.status === 429) {
    return MIN_RATE_LIMIT_DELAY_MS + Math.floor(Math.random() * 1000);
  }
  return 750 * 2 ** attempt + Math.floor(Math.random() * 300);
}

function buildErrorMessage(action: string, response: Response, body: string): string {
  if (response.status === 401) {
    return `${action} failed with 401 Unauthorized. Reconnect Google Photos and retry.`;
  }
  if (response.status === 403) {
    return `${action} failed with 403 Forbidden. Confirm the Photos Library API, OAuth origin, and upload scope.`;
  }
  if (response.status === 429) {
    return `${action} failed with 429 rate limiting after retries. Retry later using the saved import session.`;
  }
  if (response.status >= 500) {
    return `${action} failed because Google Photos returned ${response.status}. This is usually temporary.`;
  }
  return `${action} failed with ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`;
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  action: string,
): Promise<Response> {
  let lastResponse: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const startedAt = performance.now();
      const response = await fetch(input, init);
      logInfo("google_photos.request_finished", {
        component: "googlePhotos",
        metadata: {
          action,
          status: response.status,
          ok: response.ok,
          attempt,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });

      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
        return response;
      }

      lastResponse = response;
      const delayMs = retryDelayMs(attempt, response);
      logWarn("google_photos.request_retrying", {
        component: "googlePhotos",
        metadata: { action, status: response.status, attempt, delayMs },
      });
      await response.body?.cancel();
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted || attempt === MAX_ATTEMPTS - 1) throw error;
      const delayMs = retryDelayMs(attempt);
      logWarn("google_photos.network_retrying", {
        component: "googlePhotos",
        metadata: { action, attempt, delayMs },
      });
      await sleep(delayMs);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error(`${action} failed`);
}

export async function uploadMediaBytes(
  accessToken: string,
  blob: Blob,
  filename: string,
): Promise<string> {
  const response = await fetchWithRetry(
    UPLOAD_ENDPOINT,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Content-Type": blob.type || "application/octet-stream",
        "X-Goog-Upload-File-Name": filename,
        "X-Goog-Upload-Protocol": "raw",
      },
      body: blob,
    },
    "upload",
  );

  if (!response.ok) {
    const body = await responseText(response);
    const error = new GooglePhotosBrowserError(
      buildErrorMessage("Upload", response, body),
      response.status,
    );
    logError("google_photos.upload_failed", error, {
      component: "googlePhotos",
      metadata: { status: response.status, bytes: blob.size },
    });
    throw error;
  }

  const token = (await response.text()).trim();
  if (!token) throw new GooglePhotosBrowserError("Google Photos returned an empty upload token.");
  return token;
}

function normalizedChunkSize(granularity: number): number {
  if (!Number.isFinite(granularity) || granularity <= 0) return TARGET_CHUNK_SIZE;
  return Math.max(granularity, Math.floor(TARGET_CHUNK_SIZE / granularity) * granularity);
}

async function queryResumableOffset(uploadUrl: string, signal?: AbortSignal): Promise<number> {
  const response = await fetchWithRetry(
    uploadUrl,
    {
      method: "POST",
      signal,
      headers: { "X-Goog-Upload-Command": "query" },
    },
    "resumableQuery",
  );
  if (!response.ok) {
    const body = await responseText(response);
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Query resumable upload", response, body),
      response.status,
    );
  }
  const received = Number(response.headers.get("X-Goog-Upload-Size-Received") ?? "0");
  return Number.isFinite(received) && received >= 0 ? received : 0;
}

export async function uploadMediaBytesResumable(
  accessToken: string,
  blob: Blob,
  filename: string,
  options: {
    contentType?: string;
    onProgress?: (uploadedBytes: number, totalBytes: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const contentType = options.contentType || blob.type || "application/octet-stream";
  const startResponse = await fetchWithRetry(
    UPLOAD_ENDPOINT,
    {
      method: "POST",
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Raw-Size": String(blob.size),
        "X-Goog-Upload-Content-Type": contentType,
        "X-Goog-Upload-File-Name": filename,
      },
    },
    "resumableStart",
  );

  if (!startResponse.ok) {
    const body = await responseText(startResponse);
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Start resumable upload", startResponse, body),
      startResponse.status,
    );
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new GooglePhotosBrowserError("Google Photos did not return a resumable upload URL.");

  const granularity = Number(startResponse.headers.get("X-Goog-Upload-Chunk-Granularity") ?? "0");
  const chunkSize = normalizedChunkSize(granularity);
  let offset = 0;

  while (offset < blob.size) {
    const end = Math.min(offset + chunkSize, blob.size);
    const isFinal = end >= blob.size;
    let response: Response;

    try {
      response = await fetch(uploadUrl, {
        method: "POST",
        signal: options.signal,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Goog-Upload-Command": isFinal ? "upload, finalize" : "upload",
          "X-Goog-Upload-Offset": String(offset),
        },
        body: blob.slice(offset, end, contentType),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      offset = await queryResumableOffset(uploadUrl, options.signal);
      options.onProgress?.(offset, blob.size);
      continue;
    }

    if (!response.ok) {
      if (isGooglePhotosRetryableStatus(response.status)) {
        const delayMs = retryDelayMs(0, response);
        await response.body?.cancel();
        await sleep(delayMs);
        offset = await queryResumableOffset(uploadUrl, options.signal);
        options.onProgress?.(offset, blob.size);
        continue;
      }
      const body = await responseText(response);
      throw new GooglePhotosBrowserError(
        buildErrorMessage("Resumable upload", response, body),
        response.status,
      );
    }

    offset = end;
    options.onProgress?.(offset, blob.size);
    logInfo("upload.resumable_progress", {
      component: "googlePhotos",
      metadata: { uploadedBytes: offset, totalBytes: blob.size },
    });

    if (isFinal) {
      const token = (await response.text()).trim();
      if (!token) {
        throw new GooglePhotosBrowserError(
          "Google Photos returned an empty upload token after resumable upload.",
        );
      }
      return token;
    }

    await response.body?.cancel();
  }

  throw new GooglePhotosBrowserError("Resumable upload finished without an upload token.");
}

interface BatchCreateResponse {
  newMediaItemResults?: Array<{
    uploadToken?: string;
    status?: { code?: number; message?: string };
    mediaItem?: { id?: string; productUrl?: string };
  }>;
}

let batchCreateQueue: Promise<unknown> = Promise.resolve();

async function enqueueBatchCreate<T>(operation: () => Promise<T>): Promise<T> {
  const run = batchCreateQueue.then(operation, operation);
  batchCreateQueue = run.catch(() => undefined);
  return run;
}

export async function createMediaItems(
  accessToken: string,
  items: Array<{ uploadToken: string; filename: string }>,
): Promise<Array<{ uploadToken: string; mediaItemId?: string; productUrl?: string; error?: string }>> {
  if (items.length > 50) {
    throw new GooglePhotosBrowserError("Google Photos batchCreate supports at most 50 items per request.");
  }

  const response = await enqueueBatchCreate(() =>
    fetchWithRetry(
      BATCH_CREATE_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newMediaItems: items.map((item) => ({
            simpleMediaItem: { fileName: item.filename, uploadToken: item.uploadToken },
          })),
        }),
      },
      "batchCreate",
    ),
  );

  const body = await responseText(response);
  if (!response.ok) {
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Create media items", response, body),
      response.status,
    );
  }

  let parsed: BatchCreateResponse;
  try {
    parsed = JSON.parse(body || "{}") as BatchCreateResponse;
  } catch {
    throw new GooglePhotosBrowserError("Google Photos returned an invalid batchCreate response.");
  }

  return items.map((item, index) => {
    const result = parsed.newMediaItemResults?.[index];
    const code = result?.status?.code ?? 0;
    if (code !== 0) {
      return {
        uploadToken: item.uploadToken,
        error: result?.status?.message || "Google Photos rejected the media item",
      };
    }
    return {
      uploadToken: item.uploadToken,
      mediaItemId: result?.mediaItem?.id,
      productUrl: result?.mediaItem?.productUrl,
    };
  });
}

export async function createMediaItem(
  accessToken: string,
  uploadToken: string,
  filename: string,
): Promise<{ mediaItemId?: string; productUrl?: string }> {
  const [result] = await createMediaItems(accessToken, [{ uploadToken, filename }]);
  if (result.error) throw new GooglePhotosBrowserError(result.error);
  return { mediaItemId: result.mediaItemId, productUrl: result.productUrl };
}
