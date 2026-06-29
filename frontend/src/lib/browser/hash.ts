export async function sha256Blob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hashFingerprint(sha256: string, size: number, detectedMime?: string): string {
  return `${sha256}:${size}:${detectedMime ?? "unknown"}`;
}
