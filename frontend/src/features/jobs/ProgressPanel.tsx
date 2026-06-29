import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
  formatRelativeTime,
} from "@/lib/format";
import type { JobResponse } from "./types";
import {
  STATUS_BADGE_TONE,
  STATUS_LABEL,
  isTerminal,
  progressPercent,
} from "./jobHelpers";

export interface ProgressPanelProps {
  job: JobResponse;
  polling: boolean;
  lastUpdatedAt: number | null;
  onCancelImport: () => Promise<void> | void;
}

export function ProgressPanel({
  job,
  polling,
  lastUpdatedAt,
  onCancelImport,
}: ProgressPanelProps) {
  const pct = progressPercent(job.counters);
  const terminal = isTerminal(job.status);

  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card className="motion-rise">
      <CardHeader
        eyebrow="Importing"
        title="Moving your memories"
        description={terminal ? "Import finished. Review the summary below." : "Keep this tab open while your photos and videos are added."}
        actions={
          <Badge
            tone={STATUS_BADGE_TONE[job.status]}
            pulse={polling && !terminal}
          >
            {STATUS_LABEL[job.status]}
          </Badge>
        }
      />

      <div className="mb-6 rounded-3xl border border-white/60 bg-white/55 p-4 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <StatusTimeline status={job.status} />
      </div>

      <Progress
        value={pct}
        label={`${job.counters.uploaded_count.toLocaleString()} of ${job.counters.supported_files.toLocaleString()} files uploaded`}
        tone={
          job.status === "failed"
            ? "danger"
            : job.status === "partially_completed"
              ? "warn"
              : job.status === "completed"
                ? "success"
                : "brand"
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Uploaded"
          value={job.counters.uploaded_count}
          tone="success"
          icon={<IconCheck className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Created"
          value={job.counters.created_count ?? job.counters.uploaded_count}
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
          label="Skipped"
          value={job.counters.unsupported_count}
          tone="warn"
          icon={<IconAlert className="h-3.5 w-3.5" />}
        />
        <StatTile
          label="Moved"
          value={job.counters.bytes_processed}
          format={(n) => formatBytes(n)}
          tone="neutral"
          icon={<IconFile className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/60 bg-white/55 px-4 py-3 text-sm text-ink-muted shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
        <span className="inline-flex items-center gap-2">
          <IconClock className="h-4 w-4" />
          {terminal
            ? "Done"
            : polling
              ? lastUpdatedAt
                ? `Updated ${formatRelativeTime(lastUpdatedAt)}`
                : "Starting..."
              : "Paused"}
        </span>
        {!terminal ? (
          <Button
            variant="secondary"
            onClick={onCancelImport}
            leading={<IconX className="h-4 w-4" />}
          >
            Stop import
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
