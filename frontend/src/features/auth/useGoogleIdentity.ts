import { useCallback, useEffect, useRef, useState } from "react";

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
    if (!CLIENT_ID) return;

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
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
            errorRef.current?.(message);
            return;
          }
          callbackRef.current(response.access_token, response.expires_in);
        },
        error_callback: (error) => {
          const message = error.type === "popup_failed_to_open"
            ? "Google sign-in popup was blocked. Allow popups for this site and try again."
            : error.type === "popup_closed"
              ? "Google sign-in popup was closed before access was granted."
              : error.message || "Google Identity Services could not start sign-in.";
          errorRef.current?.(message);
        },
      });
      setReady(true);
    };

    tryInit();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestAccessToken = useCallback(() => {
    tokenClientRef.current?.requestAccessToken({ prompt: "consent" });
  }, []);

  return { enabled: Boolean(CLIENT_ID), ready, requestAccessToken };
}
