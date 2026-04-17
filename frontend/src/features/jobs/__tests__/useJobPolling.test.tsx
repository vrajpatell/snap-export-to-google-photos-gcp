import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobResponse } from "@/lib/api/types";
import { useJobPolling } from "../useJobPolling";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getImport: vi.fn(),
  };
});

const { getImport } = await import("@/lib/api");
const mockedGet = vi.mocked(getImport);

const baseJob = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  job_id: "job-x",
  status: "uploading",
  counters: {
    total_discovered: 0,
    supported_files: 10,
    uploaded_count: 0,
    skipped_duplicates: 0,
    failed_count: 0,
    unsupported_count: 0,
    bytes_processed: 0,
  },
  ...overrides,
});

describe("useJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedGet.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when no job is set", () => {
    const { result } = renderHook(() => useJobPolling(null));
    expect(result.current.polling).toBe(false);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("polls while active and stops when the job reaches a terminal state", async () => {
    mockedGet
      .mockResolvedValueOnce(baseJob({ status: "uploading" }))
      .mockResolvedValueOnce(
        baseJob({
          status: "completed",
          counters: {
            total_discovered: 0,
            supported_files: 10,
            uploaded_count: 10,
            skipped_duplicates: 0,
            failed_count: 0,
            unsupported_count: 0,
            bytes_processed: 100,
          },
        }),
      );

    const { result } = renderHook(() =>
      useJobPolling(baseJob({ status: "uploading" }), undefined, 1000),
    );

    expect(result.current.polling).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(result.current.job?.status).toBe("completed"));
    expect(result.current.polling).toBe(false);

    // No further polls after terminal.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("does not poll terminal jobs on mount", async () => {
    const { result } = renderHook(() =>
      useJobPolling(baseJob({ status: "completed" })),
    );
    expect(result.current.polling).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
