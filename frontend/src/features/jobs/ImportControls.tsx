import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  IconPause,
  IconPlay,
  IconStop,
} from "@/components/ui/icons";
import {
  ApiError,
  cancelImport,
  pauseImport,
  resumeImport,
  startImport,
} from "@/lib/api";
import type { JobResponse } from "@/lib/api/types";
import { availableActions } from "./jobHelpers";

export interface ImportControlsProps {
  job: JobResponse;
  sessionToken?: string;
  onAction: () => Promise<void> | void;
}

type ActionKey = "start" | "pause" | "resume" | "cancel";

export function ImportControls({
  job,
  sessionToken,
  onAction,
}: ImportControlsProps) {
  const [pending, setPending] = useState<ActionKey | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const actions = availableActions(job.status);

  async function run(key: ActionKey, fn: () => Promise<unknown>, label: string) {
    if (pending) return; // prevent duplicate submits
    setPending(key);
    try {
      await fn();
      toast.success(label);
      await onAction();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message || `Failed to ${key} import`);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!actions.start}
          loading={pending === "start"}
          onClick={() =>
            run(
              "start",
              () => startImport(job.job_id, sessionToken),
              "Import started",
            )
          }
          leading={<IconPlay className="h-4 w-4" />}
        >
          Start import
        </Button>
        <Button
          variant="secondary"
          disabled={!actions.pause}
          loading={pending === "pause"}
          onClick={() =>
            run(
              "pause",
              () => pauseImport(job.job_id, sessionToken),
              "Import paused",
            )
          }
          leading={<IconPause className="h-4 w-4" />}
        >
          Pause
        </Button>
        <Button
          variant="secondary"
          disabled={!actions.resume}
          loading={pending === "resume"}
          onClick={() =>
            run(
              "resume",
              () => resumeImport(job.job_id, sessionToken),
              "Import resumed",
            )
          }
          leading={<IconPlay className="h-4 w-4" />}
        >
          Resume
        </Button>
        <Button
          variant="ghost"
          disabled={!actions.cancel}
          onClick={() => setConfirmCancel(true)}
          leading={<IconStop className="h-3.5 w-3.5 text-danger" />}
          className="text-danger hover:bg-danger-soft/60"
        >
          Cancel
        </Button>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        tone="danger"
        title="Cancel this import?"
        description="Files already uploaded to your Google Photos library will not be removed. The job will be marked as cancelled and cannot be resumed."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmCancel(false)}
              disabled={pending === "cancel"}
            >
              Keep running
            </Button>
            <Button
              variant="danger"
              loading={pending === "cancel"}
              onClick={() => {
                setConfirmCancel(false);
                void run(
                  "cancel",
                  () => cancelImport(job.job_id, sessionToken),
                  "Import cancelled",
                );
              }}
            >
              Yes, cancel import
            </Button>
          </>
        }
      />
    </>
  );
}
