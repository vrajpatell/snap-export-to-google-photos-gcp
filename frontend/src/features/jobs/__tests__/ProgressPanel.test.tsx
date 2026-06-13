import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JobResponse } from "../types";
import { ProgressPanel } from "../ProgressPanel";

const baseJob = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  job_id: "job-abc-123",
  status: "uploading",
  counters: {
    total_discovered: 100,
    supported_files: 100,
    uploaded_count: 40,
    skipped_duplicates: 10,
    failed_count: 2,
    unsupported_count: 3,
    bytes_processed: 4096,
  },
  created_at: "2026-04-17T10:00:00.000Z",
  updated_at: "2026-04-17T10:05:00.000Z",
  ...overrides,
});

describe("ProgressPanel", () => {
  it("renders progress and stat tiles", () => {
    render(
      <ProgressPanel
        job={baseJob()}
        polling
        lastUpdatedAt={Date.now()}
        onCancelImport={() => {}}
      />,
    );

    const progress = screen.getByRole("progressbar");
    // (uploaded + duplicates) / supported = 50 / 100 = 50%.
    expect(progress).toHaveAttribute("aria-valuenow", "50");

    expect(screen.getByText(/Uploaded/)).toBeInTheDocument();
    expect(screen.getByText(/Failed/)).toBeInTheDocument();
    expect(screen.getByText(/Duplicates/)).toBeInTheDocument();
    expect(screen.getByText(/Unsupported/)).toBeInTheDocument();
    expect(screen.getByText(/Bytes Processed/)).toBeInTheDocument();
  });

  it("tells users to download the local report for terminal jobs", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "completed" })}
        polling={false}
        lastUpdatedAt={Date.now()}
        onCancelImport={() => {}}
      />,
    );
    expect(
      screen.getByText(/Download the local report/i),
    ).toBeInTheDocument();
  });

  it("renders only the browser cancel control while uploading", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "uploading" })}
        polling
        lastUpdatedAt={Date.now()}
        onCancelImport={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /Cancel browser import/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resume/i })).not.toBeInTheDocument();
  });
});
