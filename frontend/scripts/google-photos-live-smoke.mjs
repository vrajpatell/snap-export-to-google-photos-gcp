const accessToken = process.env.GOOGLE_PHOTOS_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error(
    "GOOGLE_PHOTOS_ACCESS_TOKEN is required. Generate a short-lived token with the photoslibrary.appendonly scope.",
  );
}

const uploadEndpoint = "https://photoslibrary.googleapis.com/v1/uploads";
const batchCreateEndpoint =
  "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate";

// Valid 1x1 transparent PNG. The test creates one visible item in the authenticated
// Google Photos library; the API does not provide a delete endpoint.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const fileName = `DELETE-ME-snap-import-smoke-${timestamp}.png`;

async function readResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText}: ${text || "empty response"}`,
    );
  }
  return text;
}

const uploadResponse = await fetch(uploadEndpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/octet-stream",
    "X-Goog-Upload-Content-Type": "image/png",
    "X-Goog-Upload-File-Name": fileName,
    "X-Goog-Upload-Protocol": "raw",
  },
  body: png,
});

const uploadToken = (await readResponse(uploadResponse)).trim();
if (!uploadToken) {
  throw new Error("Google Photos returned an empty upload token.");
}

const createResponse = await fetch(batchCreateEndpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    newMediaItems: [
      {
        description: "Automated smoke test for snap-export-to-google-photos-gcp",
        simpleMediaItem: { fileName, uploadToken },
      },
    ],
  }),
});

const payload = JSON.parse(await readResponse(createResponse));
const result = payload.newMediaItemResults?.[0];
const statusCode = result?.status?.code ?? 0;

if (statusCode !== 0 || !result?.mediaItem?.id) {
  throw new Error(
    `Google Photos did not create the smoke-test item: ${JSON.stringify(result)}`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      fileName,
      mediaItemId: result.mediaItem.id,
      productUrl: result.mediaItem.productUrl ?? null,
    },
    null,
    2,
  ),
);
