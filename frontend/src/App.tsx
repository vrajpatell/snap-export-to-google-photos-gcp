import { useCallback, useState } from "react";
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
import { isTerminal } from "@/features/jobs/jobHelpers";
import {
  buildCsvReport,
  buildJsonReport,
  downloadTextFile,
} from "@/lib/browser/report";
import {
  runBrowserImport,
  type BrowserImportReportRow,
} from "@/lib/browser/snapZipImport";
import type { JobResponse } from "@/lib/api/types";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null);
  const [stagedPath, setStagedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [reportRows, setReportRows] = useState<BrowserImportReportRow[]>([]);

  const handleAccessToken = useCallback(
    (token: string, expiresInSeconds?: number) => {
      setAccessToken(token);
      setConnected(true);
      setAccessTokenExpiresAt(
        expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null,
      );
    },
    [],
  );

  async function handleCreateAndStart() {
    if (!selectedFile || !accessToken || creating) return;
    if (accessTokenExpiresAt && accessTokenExpiresAt - Date.now() < 60_000) {
      toast.error("Your Google access token is about to expire. Refresh access first.");
      return;
    }

    setCreating(true);
    setReportRows([]);
    try {
      const result = await runBrowserImport({
        file: selectedFile,
        accessToken,
        onJob: (nextJob) => {
          setJob(nextJob);
          setLastUpdatedAt(Date.now());
        },
        onReportRow: (row) => setReportRows((prev) => [...prev, row]),
      });
      setJob(result.job);
      setLastUpdatedAt(Date.now());
      if (result.job.status === "completed") {
        toast.success("Import completed in your browser.");
      } else if (result.job.status === "partially_completed") {
        toast("Import completed with some failures. Download the report for details.", {
          icon: "⚠️",
        });
      } else {
        toast.error("Import did not complete. Download the report for details.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function handleStartNew() {
    setJob(null);
    setStagedPath(null);
    setSelectedFile(null);
    setReportRows([]);
    setLastUpdatedAt(null);
  }

  function downloadJsonReport() {
    if (!job) return;
    downloadTextFile(
      `${job.job_id}.json`,
      buildJsonReport(job, reportRows),
      "application/json;charset=utf-8",
    );
  }

  function downloadCsvReport() {
    if (!job) return;
    downloadTextFile(
      `${job.job_id}.csv`,
      buildCsvReport(reportRows),
      "text/csv;charset=utf-8",
    );
  }

  const canCreate = Boolean(stagedPath && selectedFile && accessToken) && !job;
  const showCompletion = job && isTerminal(job.status);

  return (
    <div className="min-h-full">
      <Toaster />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
        <Header connected={connected} />

        <div className="grid gap-6">
          <ConnectCard connected={connected} onAccessToken={handleAccessToken} />

          <UploadCard
            disabled={!connected}
            onStagedPath={setStagedPath}
            onFileReady={setSelectedFile}
          />

          {job ? (
            <ProgressPanel
              job={job}
              polling={creating && !isTerminal(job.status)}
              lastUpdatedAt={lastUpdatedAt}
              onAction={() => undefined}
              showControls={false}
            />
          ) : (
            <Card>
              <CardHeader
                eyebrow="Step 3"
                title="Start the local import"
                description="Your browser will unzip the Snapchat export, upload supported media directly to Google Photos, and keep a local duplicate ledger in this browser profile."
              />
              {canCreate ? (
                <Button
                  onClick={handleCreateAndStart}
                  loading={creating}
                  leading={<IconPlay className="h-4 w-4" />}
                >
                  Start browser import
                </Button>
              ) : (
                <EmptyState
                  icon={<IconSparkles className="h-5 w-5" />}
                  title="Waiting for access and a local archive"
                  description="Connect Google Photos and validate a Snapchat export ZIP to unlock this step."
                />
              )}
            </Card>
          )}

          {showCompletion && job ? (
            <CompletionCard
              job={job}
              onStartNew={handleStartNew}
              onDownloadJson={downloadJsonReport}
              onDownloadCsv={downloadCsvReport}
            />
          ) : null}
        </div>

        <footer className="mt-10 text-center text-xs text-ink-subtle">
          Free Vercel mode · No server-side storage, queues, databases, or paid cloud infrastructure.
        </footer>
      </main>
    </div>
  );
}
