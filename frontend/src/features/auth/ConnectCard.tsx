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
import { logInfo, logWarn } from "@/lib/observability/logger";
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
      logInfo("auth.connected", {
        component: "ConnectCard",
        metadata: {
          expiresInSeconds: expiresInSeconds ?? null,
          scope: GOOGLE_PHOTOS_SCOPE,
        },
      });
      onAccessToken(accessToken, expiresInSeconds);
      toast.success("Google Photos connected.");
    },
    (message) => {
      setBusy(false);
      setError(message);
      logWarn("auth.connect_error", {
        component: "ConnectCard",
        message,
        metadata: { ready, identityEnabled },
      });
      toast.error(message);
    },
  );

  function connectPhotos() {
    logInfo("auth.connect_clicked", {
      component: "ConnectCard",
      metadata: { connected, ready, identityEnabled },
    });
    if (!identityEnabled) {
      const message = "Google sign-in is not ready yet.";
      setError(message);
      logWarn("auth.client_id_missing", { component: "ConnectCard", message });
      return;
    }
    if (!ready) {
      const message = "Google sign-in is loading. Try again in a moment.";
      setError(message);
      logWarn("auth.identity_not_ready", { component: "ConnectCard", message });
      return;
    }
    setBusy(true);
    setError(null);
    requestAccessToken();
  }

  return (
    <Card className="motion-rise motion-rise-delay-1 shine">
      <CardHeader
        eyebrow="Step 1"
        title="Connect Google Photos"
        description="Sign in once and choose where your memories go."
        actions={
          connected ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Ready
            </Badge>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="memory-tile flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-success-soft text-success">
            <IconShield className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Private flow</p>
            <p className="text-xs text-ink-muted">Your account, your library</p>
          </div>
        </div>
        <div className="memory-tile flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <IconCloud className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Direct upload</p>
            <p className="text-xs text-ink-muted">No extra setup</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={connectPhotos}
          loading={busy}
          disabled={connected && busy}
          size="lg"
          leading={<IconCloud className="h-4 w-4" />}
          trailing={!connected ? <IconLink className="h-4 w-4" /> : undefined}
        >
          {connected ? "Reconnect" : "Connect Google Photos"}
        </Button>
        {connected ? (
          <Button
            variant="secondary"
            onClick={connectPhotos}
            leading={<IconRefresh className="h-4 w-4" />}
          >
            Refresh access
          </Button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger-soft/80 px-4 py-3 text-sm text-danger"
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
