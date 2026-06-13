const UPLOAD_ENDPOINT = "https://photoslibrary.googleapis.com/v1/uploads";
const BATCH_CREATE_ENDPOINT =
  "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

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

function buildErrorMessage(action: string, response: Response, body: string): string {
  const detail = body ? `: ${body}` : "";
  return `${action} failed with ${response.status} ${response.statusText}${detail}`;
}

export async function uploadMediaBytes(
  accessToken: string,
  blob: Blob,
  filename: string,
): Promise<string> {
  const response = await fetch(UPLOAD_ENDPOINT, {
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

export async function createMediaItem(
  accessToken: string,
  uploadToken: string,
  filename: string,
  description?: string,
): Promise<{ mediaItemId?: string; productUrl?: string }> {
  const response = await fetch(BATCH_CREATE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      newMediaItems: [
        {
          description,
          simpleMediaItem: {
            fileName: filename,
            uploadToken,
          },
        },
      ],
    }),
  });

  const body = await responseText(response);
  if (!response.ok) {
    throw new GooglePhotosBrowserError(
      buildErrorMessage("Create media item", response, body),
      response.status,
    );
  }

  const parsed = JSON.parse(body || "{}") as BatchCreateResponse;
  const result = parsed.newMediaItemResults?.[0];
  const code = result?.status?.code ?? 0;
  if (code !== 0) {
    throw new GooglePhotosBrowserError(
      result?.status?.message || "Google Photos rejected the media item",
      code,
    );
  }

  return {
    mediaItemId: result?.mediaItem?.id,
    productUrl: result?.mediaItem?.productUrl,
  };
}
