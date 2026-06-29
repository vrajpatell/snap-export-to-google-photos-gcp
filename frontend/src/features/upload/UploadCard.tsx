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
import { logInfo, logWarn } from "@/lib/observability/logger";
import { useStagedUpload } from "./useStagedUpload";

const PHASE_LABEL: Record<string, string> = {
  idle: "Ready",
  preparing: "Checking archive...",
  uploading: "Preparing files...",
  finalizing: "Almost ready...",
  complete: "Ready to import",
  error: "Could not validate",
};

export interface UploadCardProps {
  disabled?: boolean;
  onStagedPath: (path: string | null) => void;
  onFileReady: (file: File | null) => void;
}

function extensionFor(file: File): string {
  const dotIndex = file.name.lastIndexOf(".");
  return dotIndex === -1 ? "none" : file.name.slice(dotIndex + 1).toLowerCase();
}

export function UploadCard({ disabled, onStagedPath, onFileReady }: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const { phase, progress, stagedPath, error, upload, reset } = useStagedUpload();

  useEffect(() => {
    onStagedPath(stagedPath);
  }, [stagedPath, onStagedPath]);

  useEffect(() => {
    logInfo("upload.phase_changed", {
      component: "UploadCard",
      metadata: {
        phase,
        progress,
        hasFile: Boolean(file),
        fileSize: file?.size ?? null,
        fileType: file?.type || null,
        extension: file ? extensionFor(file) : null,
      },
    });

    if (phase === "complete") {
      toast.success("ZIP looks good.");
      logInfo("upload.validation_complete", {
        component: "UploadCard",
        metadata: {
          fileSize: file?.size ?? null,
          fileType: file?.type || null,
          extension: file ? extensionFor(file) : null,
        },
      });
      onFileReady(file);
    } else if (phase === "error" && error) {
      toast.error(error);
      logWarn("upload.validation_error", {
        component: "UploadCard",
        message: error,
        metadata: {
          fileSize: file?.size ?? null,
          fileType: file?.type || null,
          extension: file ? extensionFor(file) : null,
        },
      });
      onFileReady(null);
    }
  }, [phase, error, file, onFileReady, progress]);

  const uploading = phase === "preparing" || phase === "uploading" || phase === "finalizing";
  const indeterminate = phase === "preparing" || phase === "finalizing";
  const complete = phase === "complete" && !!stagedPath;

  return (
    <Card className="motion-rise motion-rise-delay-2">
      <CardHeader
        eyebrow="Step 2"
        title="Choose your export"
        description="Upload the ZIP you downloaded from Snapchat."
        actions={
          complete ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Checked
            </Badge>
          ) : null
        }
      />

      <Dropzone
        file={file}
        onSelect={(next) => {
          setFile(next);
          onFileReady(null);
          logInfo("upload.file_selected", {
            component: "UploadCard",
            metadata: next
              ? {
                  fileSize: next.size,
                  fileType: next.type || "unknown",
                  extension: extensionFor(next),
                }
              : { cleared: true },
          });
          if (!next) {
            reset();
            onStagedPath(null);
          }
        }}
        disabled={disabled || uploading}
        hint="we’ll scan it first"
      />

      {file ? (
        <div className="mt-5 space-y-4">
          <Progress
            value={progress * 100}
            label={PHASE_LABEL[phase]}
            indeterminate={indeterminate}
            tone={phase === "error" ? "danger" : complete ? "success" : "brand"}
          />
          <div className="flex flex-wrap items-center gap-3">
            {complete ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    logInfo("upload.replace_file_clicked", {
                      component: "UploadCard",
                      metadata: { fileSize: file.size, extension: extensionFor(file) },
                    });
                    setFile(null);
                    reset();
                    onStagedPath(null);
                    onFileReady(null);
                  }}
                  leading={<IconX className="h-4 w-4" />}
                >
                  Choose another
                </Button>
                <span className="text-sm text-ink-muted tabular">
                  {formatBytes(file.size)} ready
                </span>
              </>
            ) : phase === "error" ? (
              <Button
                variant="primary"
                onClick={() => {
                  logInfo("upload.retry_validation_clicked", {
                    component: "UploadCard",
                    metadata: { fileSize: file.size, extension: extensionFor(file) },
                  });
                  void upload(file);
                }}
                leading={<IconRefresh className="h-4 w-4" />}
              >
                Try again
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  logInfo("upload.validate_clicked", {
                    component: "UploadCard",
                    metadata: { fileSize: file.size, extension: extensionFor(file) },
                  });
                  void upload(file);
                }}
                loading={uploading}
                disabled={disabled}
                leading={<IconUpload className="h-4 w-4" />}
              >
                {uploading ? "Checking..." : "Check ZIP"}
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
