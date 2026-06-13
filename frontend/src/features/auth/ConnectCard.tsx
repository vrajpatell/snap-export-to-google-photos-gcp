import { useState } from "react";
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
import { GOOGLE_PHOTOS_SCOPE, useGoogleIdentity } from "./useGoogleIdentity";

interface ConnectCardProps {
  connected: boolean;
  onAccessToken: (accessToken: string, expiresInSeconds?: number) => void;
}

export function ConnectCard({ connected, onAccessToken }: ConnectCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { enabled: identityEnabled, ready, requestAccessToken } = useGoogleIdentity(
    (accessToken, expiresInSeconds) => {
      setBusy(false);
      setError(null);
      onAccessToken(accessToken, expiresInSeconds);
      toast.success("Connected to Google Photos for this browser session.");
    },
    (message) => {
      setBusy(false);
      setError(message);
      toast.error(message);
    },
  );

  function connectPhotos() {
    if (!identityEnabled) {
      setError("Set VITE_GOOGLE_CLIENT_ID before connecting Google Photos.");
      return;
    }
    if (!ready) {
      setError("Google Identity Services is still loading. Try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    requestAccessToken();
  }

  return (
    <Card>
      <CardHeader
        eyebrow="Step 1"
        title="Connect your Google Photos account"
        description="Grant one browser session access to upload directly to your own Google Photos library. No backend stores your tokens or files."
        actions={
          connected ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Connected
            </Badge>
          ) : null
        }
      />

      <div className="mb-4 rounded-2xl border border-line bg-white/70 p-4 text-sm text-ink-muted">
        <p>
          This free Vercel mode uses Google Identity Services in the browser with the
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">{GOOGLE_PHOTOS_SCOPE}</code>
          scope. You may need to reconnect if the access token expires during a long import.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={connectPhotos}
          loading={busy}
          disabled={connected && busy}
          leading={<IconCloud className="h-4 w-4" />}
          trailing={!connected ? <IconLink className="h-4 w-4" /> : undefined}
        >
          {connected ? "Reconnect Google Photos" : "Connect Google Photos"}
        </Button>
        {connected ? (
          <Button
            variant="ghost"
            onClick={connectPhotos}
            leading={<IconRefresh className="h-4 w-4" />}
          >
            Refresh access token
          </Button>
        ) : null}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
        <IconShield className="h-3.5 w-3.5 text-success" aria-hidden />
        Files stay on your device until your browser uploads each item directly to Google Photos.
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
