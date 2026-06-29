import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Blob, hashFingerprint } from "../hash";
import { createImportSession, getCompletedHash, getRetryableItems, markHashCompleted, updateImportSession, upsertMediaItem } from "../importDb";
import { inspectMediaBlob, isSupportedMime } from "../mediaQuality";
import { chunk, retry, runWithConcurrency } from "../uploadQueue";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3]);

describe("browser import helpers", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns a stable SHA-256 hash", async () => {
    await expect(sha256Blob(new Blob(["abc"]))).resolves.toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("uses completed hashes for dedupe", async () => {
    const fingerprint = hashFingerprint("abc", 3, "image/jpeg");
    await markHashCompleted({ fingerprint, sha256: "abc", size: 3, detectedMime: "image/jpeg", completedAt: new Date().toISOString() });
    await expect(getCompletedHash(fingerprint)).resolves.toMatchObject({ sha256: "abc" });
  });

  it("detects extension mismatches from magic bytes", async () => {
    const info = await inspectMediaBlob(new Blob([pngBytes]), "memory.jpg");
    expect(info.detectedMime).toBe("image/png");
    expect(info.warnings.join(" ")).toContain("does not match");
  });

  it("reports unsupported media", async () => {
    const info = await inspectMediaBlob(new Blob(["plain text"]), "notes.txt");
    expect(isSupportedMime(info.detectedMime)).toBe(false);
    expect(info.warnings).toContain("Unsupported media type.");
  });

  it("respects upload concurrency limits", async () => {
    let active = 0;
    let maxActive = 0;
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return true;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("chunks batchCreate input at 50", () => {
    expect(chunk(Array.from({ length: 101 }), 50).map((part) => part.length)).toEqual([50, 50, 1]);
  });

  it("retries retryable errors with backoff", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");
    await expect(retry(fn, { sleepMs: async () => undefined })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("bad request"));
    await expect(retry(fn, { isRetryable: () => false, sleepMs: async () => undefined })).rejects.toThrow("bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("creates, updates, and resumes IndexedDB sessions", async () => {
    const session = await createImportSession({ sourceFileName: "snap.zip", sourceFileSize: 10 });
    await updateImportSession(session.id, { status: "uploading" });
    await upsertMediaItem({ id: "1", sessionId: session.id, zipPath: "a.jpg", fileName: "a.jpg", extension: "jpg", size: 1, status: "failed", retryable: true, attempts: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await expect(getRetryableItems(session.id)).resolves.toHaveLength(1);
  });
});
