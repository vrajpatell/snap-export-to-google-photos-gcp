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
      const message = "Google sign-in is not configured yet.";
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
    <Card className="motion-rise motion-rise-delay-1">
      <CardHeader
        eyebrow="Step 1"
        title="Connect Google Photos"
        description="Sign in so your selected memories can be added to your Google Photos library."
        actions={
          connected ? (
            <Badge tone="success" leading={<IconCheck className="h-3.5 w-3.5" />}>
              Ready
            </Badge>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 rounded-3xl border border-white/60 bg-white/60 p-4 text-sm text-ink-muted shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <IconShield className="h-4 w-4 text-success" />
          <span>Private by design</span>
        </div>
        <div className="flex items-center gap-2">
          <IconCloud className="h-4 w-4 text-brand-600 dark:text-brand-300" />
          <span>Uploads to your account</span>
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
          {connected ? "Reconnect Google Photos" : "Connect Google Photos"}
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
