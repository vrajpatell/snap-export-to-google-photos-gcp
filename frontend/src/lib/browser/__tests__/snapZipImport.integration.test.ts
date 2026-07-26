import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadMediaBytes: vi.fn(),
  uploadMediaBytesResumable: vi.fn(),
  createMediaItems: vi.fn(),
  createImportSession: vi.fn(),
  updateImportSession: vi.fn(),
  upsertMediaItem: vi.fn(),
  getCompletedHash: vi.fn(),
  markHashCompleted: vi.fn(),
  loadSessionReport: vi.fn(),
}));

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

vi.mock("@zip.js/zip.js", () => {
  class BlobReader {
    constructor(_blob: Blob) {}
  }

  class BlobWriter {}

  class ZipReader {
    constructor(_reader: BlobReader) {}

    async getEntries() {
      return [
        {
          filename: "memories/test-memory.png",
          directory: false,
          uncompressedSize: pngBytes.byteLength,
          getData: async () => new Blob([pngBytes], { type: "image/png" }),
        },
      ];
    }

    async close() {}
  }

  return { BlobReader, BlobWriter, ZipReader };
});

vi.mock("../googlePhotos", () => {
  class GooglePhotosBrowserError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = "GooglePhotosBrowserError";
    }
  }

  return {
    GooglePhotosBrowserError,
    uploadMediaBytes: mocks.uploadMediaBytes,
    uploadMediaBytesResumable: mocks.uploadMediaBytesResumable,
    createMediaItems: mocks.createMediaItems,
  };
});

vi.mock("../importDb", () => ({
  createImportSession: mocks.createImportSession,
  updateImportSession: mocks.updateImportSession,
  upsertMediaItem: mocks.upsertMediaItem,
  getCompletedHash: mocks.getCompletedHash,
  markHashCompleted: mocks.markHashCompleted,
  loadSessionReport: mocks.loadSessionReport,
}));

import { runBrowserImport } from "../snapZipImport";

describe("Snapchat ZIP to Google Photos import flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createImportSession.mockResolvedValue({ id: "session-1" });
    mocks.updateImportSession.mockResolvedValue(undefined);
    mocks.upsertMediaItem.mockResolvedValue(undefined);
    mocks.getCompletedHash.mockResolvedValue(undefined);
    mocks.markHashCompleted.mockResolvedValue(undefined);
    mocks.loadSessionReport.mockResolvedValue([]);
    mocks.uploadMediaBytes.mockResolvedValue("upload-token-1");
    mocks.createMediaItems.mockResolvedValue([
      {
        uploadToken: "upload-token-1",
        mediaItemId: "media-item-1",
        productUrl: "https://photos.google.com/lr/photo/media-item-1",
      },
    ]);
  });

  it("extracts, validates, uploads, creates, and reports a photo", async () => {
    const jobs: string[] = [];
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "snapchat-export.zip", {
      type: "application/zip",
    });

    const result = await runBrowserImport({
      file,
      accessToken: "test-access-token",
      onJob: (job) => jobs.push(job.status),
    });

    expect(mocks.uploadMediaBytes).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaBytes).toHaveBeenCalledWith(
      "test-access-token",
      expect.any(Blob),
      "test-memory.png",
    );
    expect(mocks.uploadMediaBytesResumable).not.toHaveBeenCalled();
    expect(mocks.createMediaItems).toHaveBeenCalledWith("test-access-token", [
      { uploadToken: "upload-token-1", filename: "test-memory.png" },
    ]);
    expect(mocks.markHashCompleted).toHaveBeenCalledOnce();

    expect(result.job.status).toBe("completed");
    expect(result.job.counters).toMatchObject({
      total_discovered: 1,
      supported_files: 1,
      uploaded_count: 1,
      created_count: 1,
      failed_count: 0,
    });
    expect(result.reportRows).toEqual([
      expect.objectContaining({
        path: "memories/test-memory.png",
        status: "uploaded",
        mediaItemId: "media-item-1",
      }),
    ]);
    expect(jobs).toContain("uploading");
    expect(jobs.at(-1)).toBe("completed");
  });
});
