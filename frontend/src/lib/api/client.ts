export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8080";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(status: number, detail: string) {
    super(ApiError.friendlyMessage(status, detail));
    this.status = status;
    this.detail = detail;
    this.retryable = status === 0 || status >= 500;
  }

  static friendlyMessage(status: number, detail: string): string {
    if (status === 0) {
      return "Network unavailable. Check your connection and try again.";
    }
    if (status === 401) return "Your session expired. Please sign in again.";
    if (status === 403) return "You don't have permission to perform this action.";
    if (status === 404) return "We couldn't find that resource.";
    if (status === 409) return "This action conflicts with the current state.";
    if (status === 413) return "That file is too large to upload.";
    if (status === 429) return "Too many requests. Please wait a moment.";
    if (status >= 500) {
      return "The service is temporarily unavailable. Please retry shortly.";
    }
    return detail || `Request failed (${status}).`;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | null;
  sessionToken?: string;
  parseJson?: boolean;
  signal?: AbortSignal;
}

function normalizeBody(
  body: RequestOptions["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (body == null) return undefined;
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams
  ) {
    return body;
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return JSON.stringify(body);
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, sessionToken, parseJson = true, signal, ...init } = options;
  const headers = new Headers(init.headers ?? {});
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  const finalBody = normalizeBody(body, headers);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      body: finalBody,
      signal,
    });
  } catch (err) {
    // fetch throws on network errors only.
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, (err as Error).message);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* ignore */
    }
    throw new ApiError(response.status, detail);
  }

  if (!parseJson) return undefined as T;
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined as T;
  return (await response.json()) as T;
}
