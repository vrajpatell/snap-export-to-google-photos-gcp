import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "../client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApiError", () => {
  it("maps 401 to a friendly, user-actionable message", () => {
    const err = new ApiError(401, "token expired");
    expect(err.message).toMatch(/session expired/i);
    expect(err.retryable).toBe(false);
  });

  it("flags 5xx as retryable with a gentle message", () => {
    const err = new ApiError(503, "");
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/temporarily unavailable/i);
  });

  it("treats network errors (status 0) as retryable", () => {
    const err = new ApiError(0, "dns lookup failed");
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/network/i);
  });
});

describe("request", () => {
  it("throws an ApiError with the response status on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", { status: 404 }),
      ),
    );
    await expect(request("/x", { method: "GET" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("wraps network errors as ApiError status=0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(request("/x", { method: "GET" })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("serializes plain-object bodies as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await request<{ ok: boolean }>("/x", {
      method: "POST",
      body: { hello: "world" },
    });
    expect(result.ok).toBe(true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
