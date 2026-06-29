import { useCallback, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconCheck, IconCloud, IconPlay, IconSparkles, IconUpload } from "@/components/ui/icons";
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
    (token: string, expiresInSeconds?: number) => {
      setAccessToken(token);
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
      toast.error("Reconnect Google Photos, then start the import.");
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
        toast.success("Import complete.");
      } else if (result.job.status === "partially_completed") {
        toast("Import finished with a few skipped items. Download the report for details.", {
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
    toast("Stopping after the current upload finishes.", { icon: "⏹️" });
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
      <div className="ambient-bg" />
      <Toaster />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <Header connected={connected} />

        <section className="grid items-center gap-8 pb-10 lg:grid-cols-[1.1fr_0.9fr] lg:pb-14">
          <div className="motion-rise space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-brand-300">
              <IconSparkles className="h-4 w-4" />
              Snapchat memories, beautifully moved
            </div>
            <div className="space-y-4">
              <h1 className="gradient-text text-5xl font-black tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                Move your Snap memories to Google Photos.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-ink-muted sm:text-xl">
                Pick your Snapchat export, connect Google Photos, and import photos and videos with live progress.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                leading={<IconPlay className="h-4 w-4" />}
                onClick={() => document.getElementById("import-flow")?.scrollIntoView({ behavior: "smooth" })}
              >
                Start import
              </Button>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              >
                See how it works
              </Button>
            </div>
            <div id="how-it-works" className="grid gap-3 pt-2 sm:grid-cols-3">
              <MiniStep icon={<IconCloud className="h-4 w-4" />} title="Connect" text="Use your Google account." />
              <MiniStep icon={<IconUpload className="h-4 w-4" />} title="Choose ZIP" text="Select your export." />
              <MiniStep icon={<IconCheck className="h-4 w-4" />} title="Import" text="Watch progress live." />
            </div>
          </div>

          <div className="hero-glass aurora-border motion-rise motion-rise-delay-2 relative p-[1px]">
            <div className="relative overflow-hidden rounded-[2rem] bg-white/80 p-5 backdrop-blur-2xl dark:bg-surface-raised/90 sm:p-6">
              <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-400/20 blur-3xl" />
              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-ink">Import preview</p>
                    <p className="text-xs text-ink-muted">Photos and videos found</p>
                  </div>
                  <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">
                    Ready
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <PreviewTile label="IMG" className="h-28" />
                  <PreviewTile label="MP4" className="h-36 translate-y-4" />
                  <PreviewTile label="HEIC" className="h-28" />
                </div>
                <div className="float-card rounded-3xl border border-white/70 bg-white/85 p-4 shadow-lift backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">Uploading memories</span>
                    <span className="text-ink-muted">72%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-brand-100 dark:bg-white/10">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-brand-400 to-indigo-500" />
                  </div>
                </div>
                <div className="float-card float-card-delay ml-auto w-4/5 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/10">
                  <p className="text-sm font-semibold text-ink">No duplicates</p>
                  <p className="text-xs text-ink-muted">Already imported items are skipped.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="import-flow" className="grid gap-6 pb-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-6">
            <ConnectCard connected={connected} onAccessToken={handleAccessToken} />
            <UploadCard
              disabled={!connected}
              onStagedPath={setStagedPath}
              onFileReady={setSelectedFile}
            />
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {job ? (
              <ProgressPanel
                job={job}
                polling={creating && !isTerminal(job.status)}
                lastUpdatedAt={lastUpdatedAt}
                onCancelImport={handleCancelImport}
              />
            ) : (
              <Card className="motion-rise motion-rise-delay-3 min-h-[24rem]">
                <CardHeader
                  eyebrow="Step 3"
                  title="Start your import"
                  description="Once your account and ZIP are ready, the import runs right here with live progress."
                />
                {canCreate ? (
                  <div className="space-y-5">
                    <Button
                      onClick={handleCreateAndStart}
                      loading={creating}
                      size="lg"
                      fullWidth
                      leading={<IconPlay className="h-4 w-4" />}
                    >
                      Import to Google Photos
                    </Button>
                    <div className="rounded-3xl border border-white/60 bg-white/60 p-4 text-sm text-ink-muted shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                      Keep this tab open while your memories move.
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={<IconSparkles className="h-5 w-5" />}
                    title="Ready when you are"
                    description="Connect Google Photos and choose your ZIP to unlock import."
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
        </section>

        <footer className="pb-8 text-center text-sm text-ink-subtle">
          Private, user-controlled transfer for your own photo library.
        </footer>
      </main>
    </div>
  );
}

function MiniStep({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/60 p-4 shadow-soft backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lift dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
        {icon}
      </div>
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function PreviewTile({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`rounded-3xl bg-gradient-to-br from-brand-100 via-white to-indigo-100 p-3 shadow-soft dark:from-brand-500/20 dark:via-white/10 dark:to-indigo-500/20 ${className ?? ""}`}>
      <div className="flex h-full flex-col justify-between">
        <span className="h-2 w-10 rounded-full bg-white/80 dark:bg-white/20" />
        <span className="text-xs font-black tracking-wider text-brand-700 dark:text-brand-200">{label}</span>
      </div>
    </div>
  );
}
