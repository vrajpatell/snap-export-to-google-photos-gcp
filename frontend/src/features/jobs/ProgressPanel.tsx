import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { StatTile } from "@/components/ui/StatTile";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconFile,
  IconRefresh,
  IconX,
} from "@/components/ui/icons";
import { StatusTimeline } from "@/components/StatusTimeline";
import {
  formatBytes,
  formatIsoTimestamp,
  formatRelativeTime,
  truncateMiddle,
} from "@/lib/format";
import type { JobResponse } from "@/lib/api/types";
import { ImportControls } from "./ImportControls";
import {
  STATUS_BADGE_TONE,
  STATUS_LABEL,
  isTerminal,
  progressPercent,
} from "./jobHelpers";

export interface ProgressPanelProps {
  job: JobResponse;
  sessionToken?: string;
  polling: boolean;
  lastUpdatedAt: number | null;
  onAction: () => Promise<void> | void;
}

export function ProgressPanel({
  job,
  sessionToken,
  polling,
  lastUpdatedAt,
  onAction,
}: ProgressPanelProps) {
  const pct = progressPercent(job.counters);
  const terminal = isTerminal(job.status);

  // Re-render "Xs ago" label without re-polling.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card>
      <CardHeader
        eyebrow="Step 3"
        title="Import control"
        description="Start, pause, resume, or cancel this import. Progress updates live."
        actions={
          <Badge
            tone={STATUS_BADGE_TONE[job.status]}
            pulse={polling && !terminal}
          >
            {STATUS_LABEL[job.status]}
          </Badge>
        }
      />

      <div className="mb-5">
        <StatusTimeline status={job.status} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <MetaChip
          icon={<IconFile className="h-3.5 w-3.5" />}
          label="Job"
          value={
            <code className="font-mono text-[11px]">
              {truncateMiddle(job.job_id, 18)}
            </code>
          }
        />
        {job.created_at ? (
          <MetaChip
            icon={<IconClock className="h-3.5 w-3.5" />}
            label="Started"
            value={formatIsoTimestamp(job.created_at)}
          />
        ) : null}
        {job.updated_at ? (
          <MetaChip
            icon={<IconRefresh className="h-3.5 w-3.5" />}
            label="Updated"
            value={formatIsoTimestamp(job.updated_at)}
          />
        ) : null}
      </div>

      <ImportControls
        job={job}
        sessionToken={sessionToken}
        onAction={onAction}
      />

      <div className="mt-6">
        <Progress
          value={pct}
          label={`${job.counters.uploaded_count.toLocaleString()} of ${job.counters.supported_files.toLocaleString()} supported files`}
          tone={
            job.status === "failed"
              ? "danger"
              : job.status === "partially_completed"
                ? "warn"
                : job.status === "completed"
                  ? "success"
                  : "brand"
          }
          indeterminate={job.status === "scanning"}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Uploaded"
          value={job.counters.uploaded_count}
          tone="success"
          icon={<IconCheck className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Failed"
          value={job.counters.failed_count}
          tone="danger"
          icon={<IconX className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Duplicates"
          value={job.counters.skipped_duplicates}
          tone="brand"
          icon={<IconRefresh className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Unsupported"
          value={job.counters.unsupported_count}
          tone="warn"
          icon={<IconAlert className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Bytes Processed"
          value={job.counters.bytes_processed}
          format={(n) => formatBytes(n)}
          tone="neutral"
          icon={<IconFile className="h-3.5 w-3.5" />}
        />
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        {terminal
          ? "Polling stopped — job reached a terminal state."
          : polling
            ? `Auto-refreshing every 3s · ${
                lastUpdatedAt ? `last update ${formatRelativeTime(lastUpdatedAt)}` : "syncing…"
              }`
            : "Polling paused."}
      </p>
    </Card>
  );
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
      <span className="text-ink-subtle" aria-hidden>
        {icon}
      </span>
      <span className="text-ink-subtle">{label}:</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
