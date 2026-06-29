export type ClientLogLevel = "debug" | "info" | "warn" | "error";

export interface ClientLogEvent {
  level: ClientLogLevel;
  event: string;
  message?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

const LOG_ENDPOINT = "/api/logs";
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 15;
const MAX_QUEUE_SIZE = 300;
const MAX_METADATA_KEYS = 50;
const MAX_STRING_LENGTH = 500;
const SENSITIVE_KEY_PATTERN = /(access|authorization|bearer|client_secret|credential|email|filename|file_name|mediaitemid|password|path|producturl|refresh|secret|source_uri|token)/i;

let initialized = false;
let flushTimer: number | undefined;
let queue: Array<Record<string, unknown>> = [];

function telemetryEnabled(): boolean {
  return import.meta.env.PROD && import.meta.env.VITE_ENABLE_VERCEL_CLIENT_LOGS !== "false";
}

function getSessionId(): string {
  const key = "snap-export-google-photos.telemetry-session.v1";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function currentPage() {
  return {
    origin: window.location.origin,
    pathname: window.location.pathname,
    visibilityState: document.visibilityState,
    online: navigator.onLine,
  };
}

function safeString(value: unknown): string {
  return String(value).slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(nested, depth + 1);
    }
    return sanitized;
  }
  return safeString(value);
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 6).join("\n"),
    };
  }
  return { message: String(error) };
}

function buildPayload(entry: ClientLogEvent): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    level: entry.level,
    event: entry.event,
    message: entry.message,
    component: entry.component,
    page: currentPage(),
    metadata: sanitizeValue(entry.metadata || {}),
  };
}

async function postLogs(events: Array<Record<string, unknown>>): Promise<void> {
  await fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
  });
}

export function flushClientLogs(useBeacon = false): void {
  if (!telemetryEnabled() || queue.length === 0) return;

  const events = queue.splice(0, MAX_BATCH_SIZE);
  const body = JSON.stringify({ events });

  if (useBeacon && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(LOG_ENDPOINT, new Blob([body], { type: "application/json" }));
    if (sent) return;
  }

  void postLogs(events).catch(() => {
    queue = events.concat(queue).slice(0, MAX_QUEUE_SIZE);
  });
}

export function logClientEvent(entry: ClientLogEvent): void {
  const payload = buildPayload(entry);

  if (entry.level === "error") {
    console.error("[client-log]", payload);
  } else if (entry.level === "warn") {
    console.warn("[client-log]", payload);
  } else {
    console.info("[client-log]", payload);
  }

  if (!telemetryEnabled()) return;
  queue.push(payload);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(queue.length - MAX_QUEUE_SIZE);
  }
  if (queue.length >= MAX_BATCH_SIZE) {
    flushClientLogs();
  }
}

export function logDebug(event: string, options: Omit<ClientLogEvent, "level" | "event"> = {}): void {
  logClientEvent({ level: "debug", event, ...options });
}

export function logInfo(event: string, options: Omit<ClientLogEvent, "level" | "event"> = {}): void {
  logClientEvent({ level: "info", event, ...options });
}

export function logWarn(event: string, options: Omit<ClientLogEvent, "level" | "event"> = {}): void {
  logClientEvent({ level: "warn", event, ...options });
}

export function logError(event: string, error: unknown, options: Omit<ClientLogEvent, "level" | "event" | "metadata"> & { metadata?: Record<string, unknown> } = {}): void {
  logClientEvent({
    level: "error",
    event,
    message: error instanceof Error ? error.message : String(error),
    component: options.component,
    metadata: {
      ...options.metadata,
      error: serializeError(error),
    },
  });
}

export function initClientLogging(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  logInfo("app.session_started", {
    component: "observability",
    metadata: {
      mode: import.meta.env.MODE,
      vercelEnv: import.meta.env.VITE_VERCEL_ENV || "unknown",
      telemetryForwardingEnabled: telemetryEnabled(),
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    },
  });

  flushTimer = window.setInterval(() => flushClientLogs(), FLUSH_INTERVAL_MS);

  window.addEventListener("online", () => logInfo("browser.online", { component: "browser" }));
  window.addEventListener("offline", () => logWarn("browser.offline", { component: "browser" }));
  document.addEventListener("visibilitychange", () => {
    logInfo("browser.visibility_changed", {
      component: "browser",
      metadata: { visibilityState: document.visibilityState },
    });
    if (document.visibilityState === "hidden") flushClientLogs(true);
  });
  window.addEventListener("error", (event) => {
    logError("browser.unhandled_error", event.error || event.message, {
      component: "browser",
      metadata: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("browser.unhandled_rejection", event.reason, { component: "browser" });
  });
  window.addEventListener("pagehide", () => {
    logInfo("app.pagehide", { component: "browser" });
    flushClientLogs(true);
    if (flushTimer) window.clearInterval(flushTimer);
  });
}
