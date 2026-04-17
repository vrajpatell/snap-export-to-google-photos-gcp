import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import {
  IconCheck,
  IconRefresh,
  IconUpload,
  IconX,
} from "@/components/ui/icons";
import { Dropzone } from "@/components/Dropzone";
import { formatBytes } from "@/lib/format";
import { useStagedUpload } from "./useStagedUpload";

const PHASE_LABEL: Record<string, string> = {
  idle: "Ready to upload",
  preparing: "Preparing secure upload...",
  uploading: "Uploading to staging bucket",
  finalizing: "Validating uploaded archive",
  complete: "Upload complete",
  error: "Upload failed",
};

export interface UploadCardProps {
  sessionToken?: string;
  disabled?: boolean;
  onStagedPath: (path: string | null) => void;
}

export function UploadCard({
  sessionToken,
  disabled,
  onStagedPath,
}: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const {
    phase,
    progress,
    stagedPath,
    error,
    upload,
    reset,
  } = useStagedUpload(sessionToken);

  useEffect(() => {
    onStagedPath(stagedPath);
  }, [stagedPath, onStagedPath]);

  useEffect(() => {
    if (phase === "complete") {
      toast.success("Snapchat export uploaded and validated.");
    } else if (phase === "error" && error) {
      toast.error(error);
    }
  }, [phase, error]);

  const uploading = phase === "preparing" || phase === "uploading" || phase === "finalizing";
  const indeterminate = phase === "preparing" || phase === "finalizing";
  const complete = phase === "complete" && !!stagedPath;

  return (
    <Card>
      <CardHeader
        eyebrow="Step 2"
        title="Upload your Snapchat export"
        description="Drag your exported .zip here. We validate it server-side before any import starts."
        actions={
          complete ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Ready to import
            </Badge>
          ) : null
        }
      />

      <Dropzone
        file={file}
        onSelect={(next) => {
          setFile(next);
          if (!next) {
            reset();
            onStagedPath(null);
          }
        }}
        disabled={disabled || uploading}
        hint="ZIP up to several GB"
      />

      {file ? (
        <div className="mt-4 space-y-3">
          <Progress
            value={progress * 100}
            label={PHASE_LABEL[phase]}
            indeterminate={indeterminate}
            tone={phase === "error" ? "danger" : complete ? "success" : "brand"}
          />
          <div className="flex flex-wrap items-center gap-2">
            {complete ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFile(null);
                    reset();
                    onStagedPath(null);
                  }}
                  leading={<IconX className="h-4 w-4" />}
                >
                  Replace file
                </Button>
                <span className="text-xs text-ink-muted tabular">
                  {formatBytes(file.size)} uploaded
                </span>
              </>
            ) : phase === "error" ? (
              <Button
                variant="primary"
                onClick={() => upload(file)}
                leading={<IconRefresh className="h-4 w-4" />}
              >
                Retry upload
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => upload(file)}
                loading={uploading}
                disabled={disabled}
                leading={<IconUpload className="h-4 w-4" />}
              >
                {uploading ? "Uploading..." : "Upload to staging"}
              </Button>
            )}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
