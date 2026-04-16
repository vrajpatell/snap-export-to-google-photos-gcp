import type { JobResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

async function request<T>(
  path: string,
  init: RequestInit = {},
  sessionToken?: string,
  parseJson = true,
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionToken) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `request failed (${response.status})`);
  }
  if (!parseJson) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function createSession(googleIdToken: string) {
  return request<{ session_token: string; email: string; expires_at: string }>(
    "/auth/session/google",
    { method: "POST", body: JSON.stringify({ id_token: googleIdToken }) },
  );
}

export async function startGooglePhotosOAuth(sessionToken?: string) {
  return request<{ authorization_url: string; state: string }>(
    "/auth/google/start",
    { method: "POST", body: JSON.stringify({ flow: "web" }) },
    sessionToken,
  );
}

export async function createStagingUploadUrl(
  file: File,
  sessionToken?: string,
): Promise<{
  upload_url: string;
  object_path: string;
  method: string;
  required_headers: Record<string, string>;
}> {
  return request(
    "/staging/upload-url",
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      }),
    },
    sessionToken,
  );
}

export async function uploadToStaging(uploadUrl: string, file: File, headers: Record<string, string>) {
  const target = uploadUrl.startsWith("http") ? uploadUrl : `${API_BASE}${uploadUrl}`;
  const response = await fetch(target, { method: "PUT", headers, body: file });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `upload failed (${response.status})`);
  }
}

export async function completeStagingObject(
  objectPath: string,
  sizeBytes: number,
  sessionToken?: string,
) {
  return request<{ staged_path: string }>(
    "/staging/complete",
    {
      method: "POST",
      body: JSON.stringify({ object_path: objectPath, size_bytes: sizeBytes }),
    },
    sessionToken,
  );
}

export async function createImport(stagedPath: string, sessionToken?: string) {
  const params = new URLSearchParams({ staged_path: stagedPath });
  return request<{ job_id: string; status: string }>(`/imports?${params.toString()}`, { method: "POST" }, sessionToken);
}

export async function startImport(jobId: string, sessionToken?: string) {
  return request<{ job_id: string; status: string }>(`/imports/${jobId}/start`, { method: "POST" }, sessionToken);
}

export async function getImport(jobId: string, sessionToken?: string) {
  return request<JobResponse>(`/imports/${jobId}`, {}, sessionToken);
}

export function reportUrl(jobId: string, fmt: "json" | "csv"): string {
  return `${API_BASE}/imports/${jobId}/report?fmt=${fmt}`;
}
