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
          }) => TokenClient;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function useGoogleIdentity(
  onAccessToken: (accessToken: string, expiresInSeconds?: number) => void,
): {
  enabled: boolean;
  ready: boolean;
  requestAccessToken: () => void;
} {
  const callbackRef = useRef(onAccessToken);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const [ready, setReady] = useState(false);
  callbackRef.current = onAccessToken;

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
            console.error("Google OAuth failed", response.error, response.error_description);
            return;
          }
          callbackRef.current(response.access_token, response.expires_in);
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
