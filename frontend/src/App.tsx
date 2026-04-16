import { useEffect, useMemo, useState } from "react";
import {
  completeStagingObject,
  createImport,
  createSession,
  createStagingUploadUrl,
  getImport,
  reportUrl,
  startGooglePhotosOAuth,
  startImport,
  uploadToStaging,
} from "./api";
import type { JobResponse } from "./types";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function isTerminal(status?: string): boolean {
  return ["completed", "partially_completed", "failed", "cancelled"].includes(status ?? "");
}

export default function App() {
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [sessionEmail, setSessionEmail] = useState<string | undefined>(undefined);
  const [authStatus, setAuthStatus] = useState("Not connected");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState("Idle");
  const [stagedPath, setStagedPath] = useState<string | undefined>(undefined);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "oauth_complete" && event.data?.ok) {
        setAuthStatus("Connected to Google Photos");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) {
      return;
    }
    const target = document.getElementById("google-signin");
    if (!target) {
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const session = await createSession(response.credential);
          setSessionToken(session.session_token);
          setSessionEmail(session.email);
          setError(null);
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });
    window.google.accounts.id.renderButton(target, { theme: "outline", size: "large" });
  }, []);

  useEffect(() => {
    if (!job?.job_id || isTerminal(job.status)) {
      setPolling(false);
      return;
    }
    setPolling(true);
    const timer = window.setInterval(async () => {
      try {
        const latest = await getImport(job.job_id, sessionToken);
        setJob(latest);
        if (isTerminal(latest.status)) {
          setPolling(false);
          window.clearInterval(timer);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [job?.job_id, job?.status, sessionToken]);

  const progress = useMemo(() => {
    if (!job) return 0;
    const total = job.counters.supported_files || 1;
    return Math.min(100, Math.round((job.counters.uploaded_count / total) * 100));
  }, [job]);

  async function connectPhotos() {
    try {
      const start = await startGooglePhotosOAuth(sessionToken);
      const popup = window.open(start.authorization_url, "_blank", "width=520,height=700");
      if (!popup) {
        setError("Popup blocked by browser");
        return;
      }
      setAuthStatus("Awaiting OAuth completion...");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function uploadSnapExport() {
    if (!selectedFile) {
      setError("Select a ZIP file first");
      return;
    }
    try {
      setUploadStatus("Requesting upload URL...");
      const uploadInfo = await createStagingUploadUrl(selectedFile, sessionToken);
      setUploadStatus("Uploading to staging bucket...");
      await uploadToStaging(uploadInfo.upload_url, selectedFile, uploadInfo.required_headers);
      setUploadStatus("Validating staged object...");
      const complete = await completeStagingObject(uploadInfo.object_path, selectedFile.size, sessionToken);
      setStagedPath(complete.staged_path);
      setUploadStatus("Upload complete");
      setError(null);
    } catch (err) {
      setUploadStatus("Upload failed");
      setError((err as Error).message);
    }
  }

  async function createAndStartImport() {
    if (!stagedPath) {
      setError("Upload a Snapchat export ZIP first");
      return;
    }
    try {
      const created = await createImport(stagedPath, sessionToken);
      await startImport(created.job_id, sessionToken);
      const latest = await getImport(created.job_id, sessionToken);
      setJob(latest);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="container">
      <h1>Snap Export to Google Photos</h1>
      <p className="muted">Secure browser upload + async import progress tracking.</p>

      <section className="card">
        <h2>1) App Access</h2>
        <div id="google-signin" />
        <p className="muted">{sessionEmail ? `Signed in as ${sessionEmail}` : "Sign in required when auth is enabled."}</p>
      </section>

      <section className="card">
        <h2>2) Connect Google Photos</h2>
        <button onClick={connectPhotos}>Connect Google Photos Account</button>
        <p className="muted">{authStatus}</p>
      </section>

      <section className="card">
        <h2>3) Upload Snapchat Export ZIP</h2>
        <input
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        />
        {selectedFile && (
          <p className="muted">
            Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
          </p>
        )}
        <button onClick={uploadSnapExport} disabled={!selectedFile}>
          Upload to Staging Bucket
        </button>
        <p className="muted">{uploadStatus}</p>
      </section>

      <section className="card">
        <h2>4) Start Import + Monitor</h2>
        <button onClick={createAndStartImport} disabled={!stagedPath}>
          Create and Start Import
        </button>
        {job && (
          <>
            <p className="muted">
              Job: <code>{job.job_id}</code> - {job.status}
            </p>
            <div className="progress">
              <div className="bar" style={{ width: `${progress}%` }} />
            </div>
            <p className="muted">
              {progress}% ({job.counters.uploaded_count}/{job.counters.supported_files}) - Auto-refresh:{" "}
              {polling ? "on (3s)" : "off"}
            </p>
            <div className="grid">
              <span>Uploaded: {job.counters.uploaded_count}</span>
              <span>Failed: {job.counters.failed_count}</span>
              <span>Duplicates: {job.counters.skipped_duplicates}</span>
              <span>Unsupported: {job.counters.unsupported_count}</span>
              <span>Bytes: {formatBytes(job.counters.bytes_processed)}</span>
            </div>
            {isTerminal(job.status) && (
              <p className="muted">
                Reports:{" "}
                <a href={reportUrl(job.job_id, "json")} target="_blank" rel="noreferrer">
                  JSON
                </a>{" "}
                |{" "}
                <a href={reportUrl(job.job_id, "csv")} target="_blank" rel="noreferrer">
                  CSV
                </a>
              </p>
            )}
          </>
        )}
      </section>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
