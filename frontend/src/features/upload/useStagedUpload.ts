import { useCallback, useRef, useState } from "react";
import {
  ApiError,
  completeStagingObject,
  createStagingUploadUrl,
  uploadToStaging,
} from "@/lib/api";

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

export function useStagedUpload(sessionToken?: string): UseStagedUpload {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setStagedPath(null);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);
      setStagedPath(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setPhase("preparing");
        const info = await createStagingUploadUrl(file, sessionToken);

        setPhase("uploading");
        await uploadToStaging(
          info.upload_url,
          file,
          info.required_headers,
          (fraction) => setProgress(fraction),
          controller.signal,
        );

        setPhase("finalizing");
        const done = await completeStagingObject(
          info.object_path,
          file.size,
          sessionToken,
        );

        setStagedPath(done.staged_path);
        setPhase("complete");
        setProgress(1);
        return done.staged_path;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setPhase("idle");
          setError(null);
          return null;
        }
        const message =
          err instanceof ApiError ? err.message : (err as Error).message;
        setError(message || "Upload failed.");
        setPhase("error");
        return null;
      }
    },
    [sessionToken],
  );

  return { phase, progress, stagedPath, error, upload, reset, cancel };
}
