import { useEffect, useRef, useState } from "react";
import { ApiError, getImport } from "@/lib/api";
import type { JobResponse } from "@/lib/api/types";
import { isTerminal } from "./jobHelpers";

export interface JobPollingResult {
  job: JobResponse | null;
  setJob: (j: JobResponse | null) => void;
  polling: boolean;
  lastUpdatedAt: number | null;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Polls `GET /imports/{id}` while the job is in a non-terminal state.
 *
 * - Pauses polling when the tab is hidden (via `visibilitychange`).
 * - Aborts inflight requests on unmount / id changes.
 * - Exposes a `refresh()` that the caller can invoke after user actions
 *   to get an immediate update without waiting for the next tick.
 */
export function useJobPolling(
  initialJob: JobResponse | null,
  sessionToken?: string,
  intervalMs = 3000,
): JobPollingResult {
  const [job, setJob] = useState<JobResponse | null>(initialJob);
  const [polling, setPolling] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(
    initialJob ? Date.now() : null,
  );
  const [error, setError] = useState<string | null>(null);

  const jobIdRef = useRef(initialJob?.job_id ?? null);
  jobIdRef.current = job?.job_id ?? null;
  const tokenRef = useRef(sessionToken);
  tokenRef.current = sessionToken;
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep state in sync if the parent swaps jobs (e.g. after create).
  useEffect(() => {
    setJob(initialJob);
    setLastUpdatedAt(initialJob ? Date.now() : null);
  }, [initialJob?.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh(): Promise<void> {
    const id = jobIdRef.current;
    if (!id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const latest = await getImport(id, tokenRef.current, controller.signal);
      setJob(latest);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message =
        err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
    }
  }

  useEffect(() => {
    const id = job?.job_id;
    if (!id || isTerminal(job?.status)) {
      setPolling(false);
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    setPolling(true);

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };

    timerRef.current = window.setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.job_id, job?.status, intervalMs]);

  return { job, setJob, polling, lastUpdatedAt, error, refresh };
}
