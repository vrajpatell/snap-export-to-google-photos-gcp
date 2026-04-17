import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  IconCheck,
  IconCloud,
  IconLink,
  IconRefresh,
  IconShield,
} from "@/components/ui/icons";
import { ApiError, startGooglePhotosOAuth } from "@/lib/api";
import { useGoogleIdentity } from "./useGoogleIdentity";

interface ConnectCardProps {
  sessionToken?: string;
  sessionEmail?: string;
  connected: boolean;
  /** Receives a Google-issued ID token; caller exchanges it for a session. */
  onGoogleIdToken: (idToken: string) => void;
  onConnectingStarted?: () => void;
}

export function ConnectCard({
  sessionToken,
  sessionEmail,
  connected,
  onGoogleIdToken,
  onConnectingStarted,
}: ConnectCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const { enabled: identityEnabled } = useGoogleIdentity(googleBtnRef, onGoogleIdToken);

  async function connectPhotos() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const start = await startGooglePhotosOAuth(sessionToken);
      const popup = window.open(
        start.authorization_url,
        "_blank",
        "width=540,height=700,menubar=no,toolbar=no",
      );
      if (!popup) {
        setError(
          "Your browser blocked the authorization window. Please allow popups and try again.",
        );
        return;
      }
      onConnectingStarted?.();
      toast("Complete Google Photos authorization in the popup window.", {
        icon: "🔐",
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : (err as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Step 1"
        title="Connect your Google Photos account"
        description="Grant access so we can securely upload your memories to your own library. You can revoke access at any time from your Google account."
        actions={
          connected ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Connected
            </Badge>
          ) : null
        }
      />

      {identityEnabled ? (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
            Sign in
          </p>
          <div ref={googleBtnRef} aria-label="Sign in with Google" />
          {sessionEmail ? (
            <p className="mt-2 text-xs text-ink-muted">
              Signed in as <span className="text-ink">{sessionEmail}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={connectPhotos}
          loading={busy}
          disabled={connected}
          leading={<IconCloud className="h-4 w-4" />}
          trailing={!connected ? <IconLink className="h-4 w-4" /> : undefined}
        >
          {connected ? "Connected to Google Photos" : "Connect Google Photos"}
        </Button>
        {connected ? (
          <Button
            variant="ghost"
            onClick={connectPhotos}
            leading={<IconRefresh className="h-4 w-4" />}
          >
            Reauthorize
          </Button>
        ) : null}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
        <IconShield className="h-3.5 w-3.5 text-success" aria-hidden />
        We only ever upload to your library — your files are never shared.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={connectPhotos}
            className="ml-auto text-danger"
            leading={<IconRefresh className="h-3.5 w-3.5" />}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
