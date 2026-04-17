import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  IconDownload,
  IconRefresh,
  IconSparkles,
} from "@/components/ui/icons";
import { reportUrl } from "@/lib/api";
import type { JobResponse } from "@/lib/api/types";
import { summarize } from "./jobHelpers";

export function CompletionCard({
  job,
  onStartNew,
}: {
  job: JobResponse;
  onStartNew: () => void;
}) {
  const { tone, title, message } = summarize(job);
  return (
    <Card>
      <CardHeader
        eyebrow="Summary"
        title={title}
        description={message}
        actions={
          <Badge tone={tone} leading={<IconSparkles className="h-3.5 w-3.5" />}>
            Report ready
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          variant="secondary"
          fullWidth
          leading={<IconDownload className="h-4 w-4" />}
          onClick={() =>
            window.open(reportUrl(job.job_id, "json"), "_blank", "noopener")
          }
        >
          Download JSON report
        </Button>
        <Button
          variant="secondary"
          fullWidth
          leading={<IconDownload className="h-4 w-4" />}
          onClick={() =>
            window.open(reportUrl(job.job_id, "csv"), "_blank", "noopener")
          }
        >
          Download CSV report
        </Button>
        <Button
          variant="primary"
          fullWidth
          onClick={onStartNew}
          leading={<IconRefresh className="h-4 w-4" />}
        >
          Start a new import
        </Button>
      </div>
    </Card>
  );
}
