import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { JobResponse } from "@/lib/api/types";
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
        onAction={() => {}}
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

  it("indicates that polling has stopped for terminal jobs", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "completed" })}
        polling={false}
        lastUpdatedAt={Date.now()}
        onAction={() => {}}
      />,
    );
    expect(
      screen.getByText(/Polling stopped/i),
    ).toBeInTheDocument();
  });

  it("renders the cancel control but disables inapplicable ones when uploading", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "uploading" })}
        polling
        lastUpdatedAt={Date.now()}
        onAction={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Start import/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pause/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Resume/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancel/i })).not.toBeDisabled();
  });
});
