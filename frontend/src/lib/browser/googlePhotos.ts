import { logError, logInfo, logWarn } from "@/lib/observability/logger";

const UPLOAD_ENDPOINT = "https://photoslibrary.googleapis.com/v1/uploads";
const BATCH_CREATE_ENDPOINT =
  "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;
const RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;

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

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }
  const base = 750 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

function buildErrorMessage(action: string, response: Response, body: string): string {
  if (response.status === 401) {
    return `${action} failed with 401 Unauthorized. Refresh your Google access token, then retry the failed items from the downloaded report.`;
  }
  if (response.status === 403) {
    return `${action} failed with 403 Forbidden. Confirm the Google Photos Library API is enabled, the OAuth origin is authorized, and the app was granted the upload scope.`;
  }
  if (response.status === 429) {
    return `${action} failed with 429 rate limiting after retries. Wait a few minutes, keep the report, and retry later.`;
  }
  if (response.status >= 500) {
    return `${action} failed because Google Photos returned ${response.status}. This is usually temporary; retry later.`;
  }
  const detail = body ? `: ${body}` : "";
  return `${action} failed with ${response.status} ${response.statusText}${detail}`;
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, action: string): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const startedAt = performance.now();
    const response = await fetch(input, init);
    const durationMs = Math.round(performance.now() - startedAt);
    logInfo("google_photos.request_finished", {
      component: "googlePhotos",
      metadata: {
        action,
        status: response.status,
        ok: response.ok,
        attempt,
        durationMs,
      },
    });
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
      return response;
    }
    lastResponse = response;
    const delayMs = retryDelayMs(attempt, response);
    logWarn("google_photos.request_retrying", {
      component: "googlePhotos",
      metadata: {
        action,
        status: response.status,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
      },
    });
    await response.body?.cancel();
    await sleep(delayMs);
  }
  return lastResponse as Response;
}

export async function uploadMediaBytes(
  accessToken: string,
  blob: Blob,
  filename: string,
): Promise<string> {
  logInfo("google_photos.upload_started", {
    component: "googlePhotos",
    metadata: {
      bytes: blob.size,
      contentType: blob.type || "application/octet-stream",
    },
  });

  const response = await fetchWithRetry(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": blob.type || "application/octet-stream",
      "X-Goog-Upload-File-Name": filename,
      "X-Goog-Upload-Protocol": "raw",
    },
    body: blob,
  }, "upload");

  if (!response.ok) {
    const body = await responseText(response);
    const error = new GooglePhotosBrowserError(
      buildErrorMessage("Upload", response, body),
      response.status,
    );
    logError("google_photos.upload_failed", error, {
      component: "googlePhotos",
      metadata: {
        status: response.status,
        bytes: blob.size,
        contentType: blob.type || "application/octet-stream",
      },
    });
    throw error;
  }

  const token = (await response.text()).trim();
  if (!token) {
    const error = new GooglePhotosBrowserError("Google Photos returned an empty upload token");
    logError("google_photos.empty_upload_token", error, {
      component: "googlePhotos",
      metadata: {
        bytes: blob.size,
        contentType: blob.type || "application/octet-stream",
      },
    });
    throw error;
  }
  logInfo("google_photos.upload_succeeded", {
    component: "googlePhotos",
    metadata: {
      bytes: blob.size,
      contentType: blob.type || "application/octet-stream",
    },
  });
  return token;
}


export async function uploadMediaBytesResumable(
  accessToken: string,
  blob: Blob,
  filename: string,
  options: { contentType?: string; onProgress?: (uploadedBytes: number, totalBytes: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const contentType = options.contentType || blob.type || "application/octet-stream";
  logInfo("upload.resumable_started", { component: "googlePhotos", metadata: { bytes: blob.size, contentType } });
  const startResponse = await fetchWithRetry(UPLOAD_ENDPOINT, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": contentType,
      "X-Goog-Upload-File-Name": filename,
      "Content-Type": "application/octet-stream",
    },
  }, "resumableStart");
  if (!startResponse.ok) {
    const body = await responseText(startResponse);
    throw new GooglePhotosBrowserError(buildErrorMessage("Start resumable upload", startResponse, body), startResponse.status);
  }
  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new GooglePhotosBrowserError("Google Photos did not return a resumable upload URL.");

  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + RESUMABLE_CHUNK_SIZE, blob.size);
    const isFinal = end >= blob.size;
    const response = await fetchWithRetry(uploadUrl, {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Goog-Upload-Command": isFinal ? "upload, finalize" : "upload",
        "X-Goog-Upload-Offset": String(offset),
      },
      body: blob.slice(offset, end, contentType),
    }, "resumableUpload");
    if (!response.ok) {
      const body = await responseText(response);
      throw new GooglePhotosBrowserError(buildErrorMessage("Resumable upload", response, body), response.status);
    }
    offset = end;
    options.onProgress?.(offset, blob.size);
    logInfo("upload.resumable_progress", { component: "googlePhotos", metadata: { uploadedBytes: offset, totalBytes: blob.size } });
    if (isFinal) {
      const token = (await response.text()).trim();
      if (!token) throw new GooglePhotosBrowserError("Google Photos returned an empty upload token after resumable upload.");
      logInfo("upload.resumable_finished", { component: "googlePhotos", metadata: { bytes: blob.size, contentType } });
      return token;
    } else {
      await response.body?.cancel();
    }
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
    const error = new GooglePhotosBrowserError("Google Photos batchCreate supports at most 50 items per request.");
    logError("google_photos.batch_create_too_large", error, {
      component: "googlePhotos",
      metadata: { itemCount: items.length },
    });
    throw error;
  }

  logInfo("google_photos.batch_create_started", {
    component: "googlePhotos",
    metadata: { itemCount: items.length },
  });

  const response = await enqueueBatchCreate(() => fetchWithRetry(BATCH_CREATE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      newMediaItems: items.map((item) => ({
        simpleMediaItem: {
          fileName: item.filename,
          uploadToken: item.uploadToken,
        },
      })),
    }),
  }, "batchCreate"));

  const body = await responseText(response);
  if (!response.ok) {
    const error = new GooglePhotosBrowserError(
      buildErrorMessage("Create media items", response, body),
      response.status,
    );
    logError("google_photos.batch_create_failed", error, {
      component: "googlePhotos",
      metadata: {
        status: response.status,
        itemCount: items.length,
      },
    });
    throw error;
  }

  const parsed = JSON.parse(body || "{}") as BatchCreateResponse;
  const results = items.map((item, index) => {
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

  logInfo("google_photos.batch_create_finished", {
    component: "googlePhotos",
    metadata: {
      itemCount: items.length,
      accepted: results.filter((result) => !result.error).length,
      rejected: results.filter((result) => Boolean(result.error)).length,
    },
  });

  return results;
}

export async function createMediaItem(
  accessToken: string,
  uploadToken: string,
  filename: string,
): Promise<{ mediaItemId?: string; productUrl?: string }> {
  const [result] = await createMediaItems(accessToken, [
    { uploadToken, filename },
  ]);
  if (result.error) {
    const error = new GooglePhotosBrowserError(result.error);
    logError("google_photos.create_media_item_rejected", error, {
      component: "googlePhotos",
    });
    throw error;
  }
  return { mediaItemId: result.mediaItemId, productUrl: result.productUrl };
}
