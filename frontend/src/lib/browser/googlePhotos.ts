const UPLOAD_ENDPOINT = "https://photoslibrary.googleapis.com/v1/uploads";
const BATCH_CREATE_ENDPOINT =
  "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

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

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(input, init);
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === MAX_RETRIES) {
      return response;
    }
    lastResponse = response;
    await response.body?.cancel();
    await sleep(retryDelayMs(attempt, response));
  }
  return lastResponse as Response;
}

export async function uploadMediaBytes(
  accessToken: string,
  blob: Blob,
  filename: string,
): Promise<string> {
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
  });

  if (!response.ok) {
    const body = await responseText(response);
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Upload", response, body),
      response.status,
    );
  }

  const token = (await response.text()).trim();
  if (!token) {
    throw new GooglePhotosBrowserError("Google Photos returned an empty upload token");
  }
  return token;
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
  }));

  const body = await responseText(response);
  if (!response.ok) {
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Create media items", response, body),
      response.status,
    );
  }

  const parsed = JSON.parse(body || "{}") as BatchCreateResponse;
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
  const [result] = await createMediaItems(accessToken, [
    { uploadToken, filename },
  ]);
  if (result.error) {
    throw new GooglePhotosBrowserError(result.error);
  }
  return { mediaItemId: result.mediaItemId, productUrl: result.productUrl };
}
