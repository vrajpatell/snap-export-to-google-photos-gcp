import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconPlay, IconSparkles } from "@/components/ui/icons";
import { Toaster } from "@/components/ui/Toaster";
import { Header } from "@/components/Header";
import { ConnectCard } from "@/features/auth/ConnectCard";
import { UploadCard } from "@/features/upload/UploadCard";
import { CompletionCard } from "@/features/jobs/CompletionCard";
import { ProgressPanel } from "@/features/jobs/ProgressPanel";
import { useJobPolling } from "@/features/jobs/useJobPolling";
import { isTerminal } from "@/features/jobs/jobHelpers";
import {
  ApiError,
  createImport,
  createSession,
  getImport,
  startImport,
} from "@/lib/api";
import type { JobResponse } from "@/lib/api/types";

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | undefined>();
  const [sessionEmail, setSessionEmail] = useState<string | undefined>();
  const [connected, setConnected] = useState(false);
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [initialJob, setInitialJob] = useState<JobResponse | null>(null);
  const [creating, setCreating] = useState(false);

  const {
    job,
    setJob,
    polling,
    lastUpdatedAt,
    refresh,
  } = useJobPolling(initialJob, sessionToken);

  // Listen for OAuth popup completion.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_complete" && event.data?.ok) {
        setConnected(true);
        toast.success("Google Photos connected");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const handleSessionCreated = useCallback(async (idToken: string) => {
    try {
      const session = await createSession(idToken);
      setSessionToken(session.session_token);
      setSessionEmail(session.email);
      toast.success(`Signed in as ${session.email}`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message);
    }
  }, []);

  async function handleCreateAndStart() {
    if (!stagedPath || creating) return;
    setCreating(true);
    try {
      const created = await createImport(stagedPath, sessionToken);
      await startImport(created.job_id, sessionToken);
      const latest = await getImport(created.job_id, sessionToken);
      setInitialJob(latest);
      toast.success("Import started");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function handleStartNew() {
    setInitialJob(null);
    setJob(null);
    setStagedPath(null);
  }

  const canCreate = Boolean(stagedPath) && !job;
  const showCompletion = job && isTerminal(job.status);

  return (
    <div className="min-h-full">
      <Toaster />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
        <Header connected={connected} accountEmail={sessionEmail} />

        <div className="grid gap-6">
          <ConnectCard
            sessionToken={sessionToken}
            sessionEmail={sessionEmail}
            connected={connected}
            onGoogleIdToken={handleSessionCreated}
          />

          <UploadCard
            sessionToken={sessionToken}
            disabled={!connected}
            onStagedPath={setStagedPath}
          />

          {job ? (
            <ProgressPanel
              job={job}
              sessionToken={sessionToken}
              polling={polling}
              lastUpdatedAt={lastUpdatedAt}
              onAction={refresh}
            />
          ) : (
            <Card>
              <CardHeader
                eyebrow="Step 3"
                title="Start the import"
                description="Once your archive is uploaded, kick off the import and watch it progress live."
              />
              {canCreate ? (
                <Button
                  onClick={handleCreateAndStart}
                  loading={creating}
                  leading={<IconPlay className="h-4 w-4" />}
                >
                  Create & start import
                </Button>
              ) : (
                <EmptyState
                  icon={<IconSparkles className="h-5 w-5" />}
                  title="Waiting for a staged archive"
                  description="Connect your Google account and upload a Snapchat export to unlock this step."
                />
              )}
            </Card>
          )}

          {showCompletion && job ? (
            <CompletionCard job={job} onStartNew={handleStartNew} />
          ) : null}
        </div>

        <footer className="mt-10 text-center text-xs text-ink-subtle">
          Built with care · Your files stay in your own Google Photos library.
        </footer>
      </main>
    </div>
  );
}
