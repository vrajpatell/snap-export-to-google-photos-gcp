import { afterEach, describe, expect, it, vi } from "vitest";

import {
  retryDelayMs,
  uploadMediaBytesResumable,
} from "../googlePhotos";

describe("Google Photos upload protocol", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enforces at least a 30 second delay for 429 responses", () => {
    const response = new Response("", {
      status: 429,
      headers: { "Retry-After": "1" },
    });

    expect(retryDelayMs(0, response)).toBeGreaterThanOrEqual(30_000);
  });

  it("uses Google Photos resumable headers and server chunk granularity", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            "X-Goog-Upload-URL": "https://upload.example/session",
            "X-Goog-Upload-Chunk-Granularity": String(4 * 1024 * 1024),
          },
        }),
      )
      .mockResolvedValueOnce(new Response("upload-token", { status: 200 }));

    const blob = new Blob([new Uint8Array(1024)], { type: "image/jpeg" });
    await expect(
      uploadMediaBytesResumable("access-token", blob, "memory.jpg"),
    ).resolves.toBe("upload-token");

    const startInit = fetchMock.mock.calls[0][1] as RequestInit;
    const startHeaders = new Headers(startInit.headers);
    expect(startHeaders.get("X-Goog-Upload-Raw-Size")).toBe(String(blob.size));
    expect(startHeaders.get("X-Goog-Upload-Content-Type")).toBe("image/jpeg");
    expect(startHeaders.get("X-Goog-Upload-Command")).toBe("start");

    const uploadInit = fetchMock.mock.calls[1][1] as RequestInit;
    const uploadHeaders = new Headers(uploadInit.headers);
    expect(uploadHeaders.get("X-Goog-Upload-Offset")).toBe("0");
    expect(uploadHeaders.get("X-Goog-Upload-Command")).toBe("upload, finalize");
  });

  it("queries the accepted offset after a network interruption", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            "X-Goog-Upload-URL": "https://upload.example/session",
            "X-Goog-Upload-Chunk-Granularity": "256",
          },
        }),
      )
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "X-Goog-Upload-Size-Received": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response("upload-token", { status: 200 }));

    await expect(
      uploadMediaBytesResumable(
        "access-token",
        new Blob([new Uint8Array(1024)], { type: "image/jpeg" }),
        "memory.jpg",
      ),
    ).resolves.toBe("upload-token");

    const queryInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect(new Headers(queryInit.headers).get("X-Goog-Upload-Command")).toBe("query");
  });
});
