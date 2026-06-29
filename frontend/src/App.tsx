import { useCallback, useRef, useState } from "react";
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
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import type { JobResponse } from "@/features/jobs/types";

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
  const cancelRequestedRef = useRef(false);
  const lastLoggedStatusRef = useRef<string | null>(null);

  const handleAccessToken = useCallback(
    (_token: string, expiresInSeconds?: number) => {
      setAccessToken(_token);
      setConnected(true);
      setAccessTokenExpiresAt(
        expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null,
      );
      logInfo("auth.access_token_received", {
        component: "App",
        metadata: {
          expiresInSeconds: expiresInSeconds ?? null,
          hasExpiry: Boolean(expiresInSeconds),
        },
      });
    },
    [],
  );

  async function handleCreateAndStart() {
    if (!selectedFile || !accessToken || creating) {
      logWarn("import.start_blocked", {
        component: "App",
        metadata: {
          hasSelectedFile: Boolean(selectedFile),
          hasAccessToken: Boolean(accessToken),
          creating,
        },
      });
      return;
    }
    if (accessTokenExpiresAt && accessTokenExpiresAt - Date.now() < 60_000) {
      logWarn("auth.token_expiring_before_import", {
        component: "App",
        metadata: { expiresInMs: accessTokenExpiresAt - Date.now() },
      });
      toast.error("Your Google access token is about to expire. Refresh access first.");
      return;
    }

    cancelRequestedRef.current = false;
    lastLoggedStatusRef.current = null;
    setCreating(true);
    setReportRows([]);
    logInfo("import.started", {
      component: "App",
      metadata: {
        fileSize: selectedFile.size,
        fileType: selectedFile.type || "unknown",
        tokenExpiresInMs: accessTokenExpiresAt ? accessTokenExpiresAt - Date.now() : null,
      },
    });

    try {
      const result = await runBrowserImport({
        file: selectedFile,
        accessToken,
        onJob: (nextJob) => {
          setJob(nextJob);
          setLastUpdatedAt(Date.now());
          const statusKey = `${nextJob.status}:${nextJob.counters.uploaded_count}:${nextJob.counters.failed_count}:${nextJob.counters.skipped_duplicates}`;
          if (statusKey !== lastLoggedStatusRef.current) {
            lastLoggedStatusRef.current = statusKey;
            logInfo("import.progress", {
              component: "App",
              metadata: {
                status: nextJob.status,
                counters: nextJob.counters,
              },
            });
          }
        },
        onReportRow: (row) => setReportRows((prev) => [...prev, row]),
        shouldCancel: () => cancelRequestedRef.current,
      });
      setJob(result.job);
      setReportRows(result.reportRows);
      setLastUpdatedAt(Date.now());
      logInfo("import.finished", {
        component: "App",
        metadata: {
          status: result.job.status,
          counters: result.job.counters,
          reportRows: result.reportRows.length,
        },
      });
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
      logError("import.failed", err, {
        component: "App",
        metadata: {
          currentJobStatus: job?.status ?? null,
          reportRows: reportRows.length,
        },
      });
      toast.error(message);
    } finally {
      setCreating(false);
      logInfo("import.ui_unlocked", { component: "App" });
    }
  }

  function handleCancelImport() {
    cancelRequestedRef.current = true;
    logWarn("import.cancel_requested", {
      component: "App",
      metadata: { currentJobStatus: job?.status ?? null },
    });
    toast("Cancellation requested. The current Google Photos request will finish first.", { icon: "⏹️" });
  }

  function handleStartNew() {
    logInfo("import.start_new", {
      component: "App",
      metadata: {
        previousStatus: job?.status ?? null,
        previousCounters: job?.counters ?? null,
      },
    });
    setJob(null);
    setStagedPath(null);
    setSelectedFile(null);
    setReportRows([]);
    setLastUpdatedAt(null);
  }

  function downloadJsonReport() {
    if (!job) return;
    logInfo("report.download_json", {
      component: "App",
      metadata: { status: job.status, rows: reportRows.length, counters: job.counters },
    });
    downloadTextFile(
      `${job.job_id}.json`,
      buildJsonReport(job, reportRows),
      "application/json;charset=utf-8",
    );
  }

  function downloadCsvReport() {
    if (!job) return;
    logInfo("report.download_csv", {
      component: "App",
      metadata: { status: job.status, rows: reportRows.length, counters: job.counters },
    });
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
              onCancelImport={handleCancelImport}
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
