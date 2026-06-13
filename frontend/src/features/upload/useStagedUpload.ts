import { useCallback, useRef, useState } from "react";

export type UploadPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "complete"
  | "error";

export interface UseStagedUpload {
  phase: UploadPhase;
  progress: number;
  stagedPath: string | null;
  error: string | null;
  upload: (file: File) => Promise<string | null>;
  reset: () => void;
  cancel: () => void;
}

function isZipLike(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
}

async function hasZipSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function useStagedUpload(): UseStagedUpload {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setPhase("idle");
    setProgress(0);
    setStagedPath(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setPhase("idle");
    setError(null);
  }, []);

  const upload = useCallback(async (file: File) => {
    cancelledRef.current = false;
    setError(null);
    setProgress(0);
    setStagedPath(null);

    try {
      setPhase("preparing");
      if (!isZipLike(file)) {
        throw new Error("Choose a .zip file exported from Snapchat.");
      }
      if (!(await hasZipSignature(file))) {
        throw new Error("The selected file does not look like a valid ZIP archive.");
      }
      if (cancelledRef.current) return null;

      setPhase("uploading");
      setProgress(0.5);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (cancelledRef.current) return null;

      setPhase("finalizing");
      const localPath = `browser-local://${file.name}`;
      setStagedPath(localPath);
      setPhase("complete");
      setProgress(1);
      return localPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Could not validate the ZIP file.");
      setPhase("error");
      return null;
    }
  }, []);

  return { phase, progress, stagedPath, error, upload, reset, cancel };
}
