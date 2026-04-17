import { useEffect, useRef, type RefObject } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * Attaches the Google Identity Services button to the given element and
 * invokes `onCredential` with a freshly minted ID token.
 */
export function useGoogleIdentity(
  targetRef: RefObject<HTMLElement>,
  onCredential: (idToken: string) => void,
): { enabled: boolean } {
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID || !targetRef.current) return;

    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      const gis = window.google?.accounts?.id;
      if (!gis || !targetRef.current) {
        window.setTimeout(tryInit, 150);
        return;
      }
      gis.initialize({
        client_id: CLIENT_ID,
        callback: (resp) => callbackRef.current(resp.credential),
      });
      gis.renderButton(targetRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        logo_alignment: "left",
      });
    };

    tryInit();
    return () => {
      cancelled = true;
    };
  }, [targetRef]);

  return { enabled: Boolean(CLIENT_ID) };
}
