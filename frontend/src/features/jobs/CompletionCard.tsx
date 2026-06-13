import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  IconDownload,
  IconRefresh,
  IconSparkles,
} from "@/components/ui/icons";
import type { JobResponse } from "./types";
import { summarize } from "./jobHelpers";

export function CompletionCard({
  job,
  onStartNew,
  onDownloadJson,
  onDownloadCsv,
}: {
  job: JobResponse;
  onStartNew: () => void;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
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
          onClick={onDownloadJson}
        >
          Download JSON report
        </Button>
        <Button
          variant="secondary"
          fullWidth
          leading={<IconDownload className="h-4 w-4" />}
          onClick={onDownloadCsv}
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
