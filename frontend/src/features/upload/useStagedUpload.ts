import { useCallback, useRef, useState } from "react";

import { logError, logInfo, logWarn } from "@/lib/observability/logger";

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

function extensionFor(file: File): string {
  const dotIndex = file.name.lastIndexOf(".");
  return dotIndex === -1 ? "none" : file.name.slice(dotIndex + 1).toLowerCase();
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
    logInfo("upload.reset", { component: "useStagedUpload" });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setPhase("idle");
    setError(null);
    logWarn("upload.cancelled", { component: "useStagedUpload" });
  }, []);

  const upload = useCallback(async (file: File) => {
    cancelledRef.current = false;
    setError(null);
    setProgress(0);
    setStagedPath(null);

    const fileMetadata = {
      fileSize: file.size,
      fileType: file.type || "unknown",
      extension: extensionFor(file),
    };

    try {
      logInfo("upload.validation_started", {
        component: "useStagedUpload",
        metadata: fileMetadata,
      });
      setPhase("preparing");
      if (!isZipLike(file)) {
        logWarn("upload.invalid_extension", {
          component: "useStagedUpload",
          metadata: fileMetadata,
        });
        throw new Error("Choose a .zip file exported from Snapchat.");
      }
      if (!(await hasZipSignature(file))) {
        logWarn("upload.invalid_zip_signature", {
          component: "useStagedUpload",
          metadata: fileMetadata,
        });
        throw new Error("The selected file does not look like a valid ZIP archive.");
      }
      if (cancelledRef.current) {
        logWarn("upload.validation_cancelled", {
          component: "useStagedUpload",
          metadata: fileMetadata,
        });
        return null;
      }

      setPhase("uploading");
      setProgress(0.5);
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      if (cancelledRef.current) {
        logWarn("upload.validation_cancelled", {
          component: "useStagedUpload",
          metadata: fileMetadata,
        });
        return null;
      }

      setPhase("finalizing");
      const localPath = `browser-local://${file.name}`;
      setStagedPath(localPath);
      setPhase("complete");
      setProgress(1);
      logInfo("upload.validation_succeeded", {
        component: "useStagedUpload",
        metadata: fileMetadata,
      });
      return localPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Could not validate the ZIP file.");
      setPhase("error");
      logError("upload.validation_failed", err, {
        component: "useStagedUpload",
        metadata: fileMetadata,
      });
      return null;
    }
  }, []);

  return { phase, progress, stagedPath, error, upload, reset, cancel };
}
