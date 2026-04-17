import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Smoothly interpolates a numeric value using `requestAnimationFrame`.
 * Falls back to the final value immediately when reduced-motion is requested
 * or when the document is hidden.
 */
export function useAnimatedNumber(value: number, durationMs = 600): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (REDUCED_MOTION || typeof document === "undefined" || document.hidden) {
      setDisplay(value);
      return;
    }
    fromRef.current = display;
    startRef.current = null;
    const delta = value - fromRef.current;
    if (delta === 0) return;

    const step = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + delta * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally depend only on `value`; animating from current display.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}
