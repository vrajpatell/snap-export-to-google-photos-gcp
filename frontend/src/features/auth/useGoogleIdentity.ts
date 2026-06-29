import { useCallback, useEffect, useRef, useState } from "react";

import { logInfo, logWarn } from "@/lib/observability/logger";

export const GOOGLE_PHOTOS_SCOPE = "https://www.googleapis.com/auth/photoslibrary.appendonly";

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (options: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function useGoogleIdentity(
  onAccessToken: (accessToken: string, expiresInSeconds?: number) => void,
  onError?: (message: string) => void,
): {
  enabled: boolean;
  ready: boolean;
  requestAccessToken: () => void;
} {
  const callbackRef = useRef(onAccessToken);
  const errorRef = useRef(onError);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const [ready, setReady] = useState(false);
  callbackRef.current = onAccessToken;
  errorRef.current = onError;

  useEffect(() => {
    if (!CLIENT_ID) {
      logWarn("auth.client_id_not_configured", { component: "useGoogleIdentity" });
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const tryInit = () => {
      if (cancelled) return;
      attempts += 1;
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        if (attempts === 1 || attempts % 20 === 0) {
          logInfo("auth.google_identity_waiting", {
            component: "useGoogleIdentity",
            metadata: { attempts },
          });
        }
        window.setTimeout(tryInit, 150);
        return;
      }

      tokenClientRef.current = oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: GOOGLE_PHOTOS_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            const message = response.error === "popup_closed" || response.error === "access_denied"
              ? "Google sign-in was cancelled or blocked. Allow popups for this site and try again."
              : response.error === "origin_mismatch"
                ? "This site origin is not authorized for the Google OAuth client. Add the exact Vercel URL in Google Cloud Console."
                : response.error_description || response.error || "Google OAuth did not return an access token.";
            logWarn("auth.token_response_error", {
              component: "useGoogleIdentity",
              message,
              metadata: {
                error: response.error || "missing_access_token",
                hasScope: Boolean(response.scope),
                tokenType: response.token_type || null,
              },
            });
            errorRef.current?.(message);
            return;
          }
          logInfo("auth.token_response_success", {
            component: "useGoogleIdentity",
            metadata: {
              expiresInSeconds: response.expires_in ?? null,
              hasScope: Boolean(response.scope),
              tokenType: response.token_type || null,
            },
          });
          callbackRef.current(response.access_token, response.expires_in);
        },
        error_callback: (error) => {
          const message = error.type === "popup_failed_to_open"
            ? "Google sign-in popup was blocked. Allow popups for this site and try again."
            : error.type === "popup_closed"
              ? "Google sign-in popup was closed before access was granted."
              : error.message || "Google Identity Services could not start sign-in.";
          logWarn("auth.google_identity_error_callback", {
            component: "useGoogleIdentity",
            message,
            metadata: { type: error.type || "unknown" },
          });
          errorRef.current?.(message);
        },
      });
      setReady(true);
      logInfo("auth.google_identity_ready", {
        component: "useGoogleIdentity",
        metadata: { attempts, scope: GOOGLE_PHOTOS_SCOPE },
      });
    };

    tryInit();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestAccessToken = useCallback(() => {
    logInfo("auth.request_access_token", {
      component: "useGoogleIdentity",
      metadata: { ready: Boolean(tokenClientRef.current) },
    });
    tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
  }, []);

  return { enabled: Boolean(CLIENT_ID), ready, requestAccessToken };
}
