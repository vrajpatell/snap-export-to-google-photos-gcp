import { API_BASE, request } from "./client";
import type {
  JobActionResponse,
  JobResponse,
  OAuthStartResponse,
  SessionResponse,
  StagingCompleteResponse,
  StagingUploadUrlResponse,
} from "./types";

export function createSession(googleIdToken: string) {
  return request<SessionResponse>("/auth/session/google", {
    method: "POST",
    body: { id_token: googleIdToken },
  });
}

export function startGooglePhotosOAuth(sessionToken?: string) {
  return request<OAuthStartResponse>("/auth/google/start", {
    method: "POST",
    body: { flow: "web" },
    sessionToken,
  });
}

export function createStagingUploadUrl(
  file: File,
  sessionToken?: string,
) {
  return request<StagingUploadUrlResponse>("/staging/upload-url", {
    method: "POST",
    body: {
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      size_bytes: file.size,
    },
    sessionToken,
  });
}

/**
 * Uploads the staged file. Reports coarse progress via the optional
 * `onProgress` callback. Uses XHR because `fetch` has no upload progress
 * events in browsers yet.
 */
export function uploadToStaging(
  uploadUrl: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const target = uploadUrl.startsWith("http")
    ? uploadUrl
    : `${API_BASE}${uploadUrl}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(1, ev.loaded / ev.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(xhr.responseText || `upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("network error during upload"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
      } else {
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }
    xhr.send(file);
  });
}

export function completeStagingObject(
  objectPath: string,
  sizeBytes: number,
  sessionToken?: string,
) {
  return request<StagingCompleteResponse>("/staging/complete", {
    method: "POST",
    body: { object_path: objectPath, size_bytes: sizeBytes },
    sessionToken,
  });
}

export function createImport(stagedPath: string, sessionToken?: string) {
  const params = new URLSearchParams({ staged_path: stagedPath });
  return request<{ job_id: string; status: string }>(
    `/imports?${params.toString()}`,
    { method: "POST", sessionToken },
  );
}

export function startImport(jobId: string, sessionToken?: string) {
  return request<JobActionResponse>(`/imports/${jobId}/start`, {
    method: "POST",
    sessionToken,
  });
}

export function pauseImport(jobId: string, sessionToken?: string) {
  return request<JobActionResponse>(`/imports/${jobId}/pause`, {
    method: "POST",
    sessionToken,
  });
}

export function resumeImport(jobId: string, sessionToken?: string) {
  return request<JobActionResponse>(`/imports/${jobId}/resume`, {
    method: "POST",
    sessionToken,
  });
}

export function cancelImport(jobId: string, sessionToken?: string) {
  return request<JobActionResponse>(`/imports/${jobId}/cancel`, {
    method: "POST",
    sessionToken,
  });
}

export function getImport(
  jobId: string,
  sessionToken?: string,
  signal?: AbortSignal,
) {
  return request<JobResponse>(`/imports/${jobId}`, { sessionToken, signal });
}

export function reportUrl(jobId: string, fmt: "json" | "csv"): string {
  return `${API_BASE}/imports/${jobId}/report?fmt=${fmt}`;
}
