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

    expect(screen.getByText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Duplicates")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Moved")).toBeInTheDocument();
  });

  it("shows the terminal summary and removes the stop control", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "completed" })}
        polling={false}
        lastUpdatedAt={Date.now()}
        onCancelImport={() => {}}
      />,
    );

    expect(
      screen.getByText(/Import finished\. Review the summary below\./i),
    ).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Stop import/i }),
    ).not.toBeInTheDocument();
  });

  it("renders only the browser stop control while uploading", () => {
    render(
      <ProgressPanel
        job={baseJob({ status: "uploading" })}
        polling
        lastUpdatedAt={Date.now()}
        onCancelImport={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Stop import/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Start import/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resume/i })).not.toBeInTheDocument();
  });
});
