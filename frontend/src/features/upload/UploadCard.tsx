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
  idle: "Ready to validate",
  preparing: "Checking ZIP archive...",
  uploading: "Keeping file in your browser",
  finalizing: "Preparing local import",
  complete: "ZIP ready",
  error: "Validation failed",
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
      toast.success("Snapchat export validated locally.");
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
    <Card>
      <CardHeader
        eyebrow="Step 2"
        title="Choose your Snapchat export"
        description="Drag your exported .zip here. In free Vercel mode the archive stays in your browser; it is never staged in a cloud bucket."
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
        hint="ZIP processed locally in your browser"
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
                  Replace file
                </Button>
                <span className="text-xs text-ink-muted tabular">
                  {formatBytes(file.size)} selected locally
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
                Retry validation
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
                {uploading ? "Checking..." : "Validate ZIP locally"}
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
