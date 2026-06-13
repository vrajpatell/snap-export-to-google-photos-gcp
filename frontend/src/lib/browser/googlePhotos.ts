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
