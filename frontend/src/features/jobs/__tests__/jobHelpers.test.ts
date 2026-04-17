import { describe, expect, it } from "vitest";
import {
  availableActions,
  isTerminal,
  progressPercent,
  summarize,
} from "../jobHelpers";
import type { JobCounters, JobResponse } from "@/lib/api/types";

const emptyCounters: JobCounters = {
  total_discovered: 0,
  supported_files: 0,
  uploaded_count: 0,
  skipped_duplicates: 0,
  failed_count: 0,
  unsupported_count: 0,
  bytes_processed: 0,
};

const job = (overrides: Partial<JobResponse>): JobResponse => ({
  job_id: "job-1",
  status: "queued",
  counters: { ...emptyCounters },
  ...overrides,
});

describe("availableActions", () => {
  it("allows only cancel while queued or scanning", () => {
    expect(availableActions("queued")).toEqual({
      start: false,
      pause: false,
      resume: false,
      cancel: true,
    });
    expect(availableActions("scanning")).toEqual({
      start: false,
      pause: false,
      resume: false,
      cancel: true,
    });
  });

  it("allows start + cancel when ready", () => {
    expect(availableActions("ready")).toEqual({
      start: true,
      pause: false,
      resume: false,
      cancel: true,
    });
  });

  it("allows pause + cancel while uploading", () => {
    expect(availableActions("uploading")).toEqual({
      start: false,
      pause: true,
      resume: false,
      cancel: true,
    });
  });

  it("allows resume + cancel while paused", () => {
    expect(availableActions("paused")).toEqual({
      start: false,
      pause: false,
      resume: true,
      cancel: true,
    });
  });

  it("disables everything in terminal states", () => {
    const terminal = [
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
    ] as const;
    for (const status of terminal) {
      expect(availableActions(status)).toEqual({
        start: false,
        pause: false,
        resume: false,
        cancel: false,
      });
    }
  });

  it("treats missing status as no actions", () => {
    expect(availableActions(undefined)).toEqual({
      start: false,
      pause: false,
      resume: false,
      cancel: false,
    });
  });
});

describe("isTerminal", () => {
  it("detects terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("partially_completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });
  it("returns false for active states", () => {
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("uploading")).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe("progressPercent", () => {
  it("returns 0 when no supported files", () => {
    expect(progressPercent(emptyCounters)).toBe(0);
  });

  it("computes uploaded + duplicates against supported files", () => {
    expect(
      progressPercent({
        ...emptyCounters,
        supported_files: 100,
        uploaded_count: 30,
        skipped_duplicates: 20,
      }),
    ).toBe(50);
  });

  it("caps at 100", () => {
    expect(
      progressPercent({
        ...emptyCounters,
        supported_files: 10,
        uploaded_count: 50,
      }),
    ).toBe(100);
  });
});

describe("summarize", () => {
  it("produces a success summary when completed", () => {
    const s = summarize(
      job({
        status: "completed",
        counters: { ...emptyCounters, uploaded_count: 42, supported_files: 42 },
      }),
    );
    expect(s.tone).toBe("success");
    expect(s.title).toMatch(/complete/i);
    expect(s.message).toMatch(/42/);
  });

  it("flags partial completions for review", () => {
    const s = summarize(
      job({
        status: "partially_completed",
        counters: { ...emptyCounters, uploaded_count: 10, supported_files: 25 },
      }),
    );
    expect(s.tone).toBe("warn");
    expect(s.message).toMatch(/10/);
    expect(s.message).toMatch(/25/);
  });

  it("surfaces failure messaging", () => {
    expect(summarize(job({ status: "failed" })).tone).toBe("danger");
  });
});
