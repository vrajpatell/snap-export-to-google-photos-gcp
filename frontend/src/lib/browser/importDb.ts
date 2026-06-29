import type { BrowserImportReportRow } from "./snapZipImport";

export type ImportSessionStatus = "created" | "scanning" | "ready" | "uploading" | "creating" | "completed" | "partially_completed" | "failed" | "cancelled";
export type MediaItemStatus = "discovered" | "unsupported" | "duplicate" | "queued" | "extracting" | "uploading" | "uploaded" | "creating" | "created" | "failed" | "cancelled";

export interface ImportCounters { totalDiscovered: number; supportedFiles: number; unsupportedCount: number; duplicateCount: number; uploadedCount: number; createdCount: number; failedCount: number; bytesProcessed: number; bytesTotal: number; }
export interface ImportSessionRecord { id: string; sourceFileName: string; sourceFileSize: number; status: ImportSessionStatus; createdAt: string; updatedAt: string; counters: ImportCounters; }
export interface MediaItemRecord { id: string; sessionId: string; zipPath: string; fileName: string; extension: string; detectedMime?: string; declaredMime?: string; category?: "photo" | "video" | "unknown"; size: number; sha256?: string; exifDate?: string; width?: number; height?: number; orientation?: number | string; status: MediaItemStatus; uploadMode?: "raw" | "resumable"; uploadToken?: string; mediaItemId?: string; productUrl?: string; error?: string; retryable?: boolean; duplicate?: boolean; qualityWarnings?: string[]; attempts: number; createdAt: string; updatedAt: string; }
export interface CompletedHashRecord { fingerprint: string; sha256: string; size: number; detectedMime?: string; completedAt: string; mediaItemId?: string; }

const DB_NAME = "snap-export-google-photos-imports";
const DB_VERSION = 1;
const STORES = ["importSessions", "mediaItems", "completedHashes", "uploadTokens", "reports"] as const;

type Store = (typeof STORES)[number];


const memoryStores: Record<Store, Map<string, unknown>> = {
  importSessions: new Map(),
  mediaItems: new Map(),
  completedHashes: new Map(),
  uploadTokens: new Map(),
  reports: new Map(),
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: store === "completedHashes" ? "fingerprint" : "id" });
      const media = request.transaction?.objectStore("mediaItems");
      if (media && !media.indexNames.contains("sessionId")) media.createIndex("sessionId", "sessionId");
      if (media && !media.indexNames.contains("status")) media.createIndex("status", "status");
      const sessions = request.transaction?.objectStore("importSessions");
      if (sessions && !sessions.indexNames.contains("status")) sessions.createIndex("status", "status");
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function tx<T>(store: Store, _mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  if (!hasIndexedDb()) {
    const m = memoryStores[store];
    const fake = {
      put: (value: { id?: string; fingerprint?: string }) => { m.set(String(value.fingerprint ?? value.id), value); return { result: value } as IDBRequest<T>; },
      get: (key: string) => ({ result: m.get(key) } as IDBRequest<T>),
      getAll: () => ({ result: Array.from(m.values()) } as IDBRequest<T>),
      delete: (key: string) => { m.delete(key); return { result: undefined } as IDBRequest<T>; },
    } as unknown as IDBObjectStore;
    const req = run(fake);
    return req && "result" in req ? req.result : undefined;
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, _mode);
    const req = run(transaction.objectStore(store));
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => { db.close(); resolve(req && "result" in req ? req.result : undefined); };
  });
}

export function emptyCounters(): ImportCounters { return { totalDiscovered: 0, supportedFiles: 0, unsupportedCount: 0, duplicateCount: 0, uploadedCount: 0, createdCount: 0, failedCount: 0, bytesProcessed: 0, bytesTotal: 0 }; }
export async function createImportSession(input: { id?: string; sourceFileName: string; sourceFileSize: number }): Promise<ImportSessionRecord> { const now = new Date().toISOString(); const rec = { id: input.id ?? `browser-${now}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, sourceFileName: input.sourceFileName, sourceFileSize: input.sourceFileSize, status: "created" as const, createdAt: now, updatedAt: now, counters: emptyCounters() }; await tx("importSessions", "readwrite", (s) => s.put(rec)); return rec; }
export async function updateImportSession(id: string, patch: Partial<Omit<ImportSessionRecord, "id" | "createdAt">>): Promise<void> { const old = await tx<ImportSessionRecord>("importSessions", "readonly", (s) => s.get(id)); if (!old) return; await tx("importSessions", "readwrite", (s) => s.put({ ...old, ...patch, updatedAt: new Date().toISOString() })); }
export async function upsertMediaItem(item: MediaItemRecord): Promise<void> { await tx("mediaItems", "readwrite", (s) => s.put({ ...item, updatedAt: new Date().toISOString() })); }
export async function bulkUpsertMediaItems(items: MediaItemRecord[]): Promise<void> { if (!hasIndexedDb()) { items.forEach((item) => memoryStores.mediaItems.set(item.id, { ...item, updatedAt: new Date().toISOString() })); return; } const db = await openDb(); await new Promise<void>((resolve, reject) => { const transaction = db.transaction("mediaItems", "readwrite"); const store = transaction.objectStore("mediaItems"); items.forEach((item) => store.put({ ...item, updatedAt: new Date().toISOString() })); transaction.onerror = () => reject(transaction.error); transaction.oncomplete = () => { db.close(); resolve(); }; }); }
export async function getCompletedHash(fingerprint: string): Promise<CompletedHashRecord | undefined> { return tx<CompletedHashRecord>("completedHashes", "readonly", (s) => s.get(fingerprint)); }
export async function markHashCompleted(record: CompletedHashRecord): Promise<void> { await tx("completedHashes", "readwrite", (s) => s.put(record)); }
export async function getRetryableItems(sessionId: string): Promise<MediaItemRecord[]> { const all = await loadSessionMediaItems(sessionId); return all.filter((i) => (i.status === "failed" && i.retryable && i.attempts < 3) || i.status === "queued" || i.status === "uploaded"); }
export async function loadSessionMediaItems(sessionId: string): Promise<MediaItemRecord[]> { const rows = await tx<MediaItemRecord[]>("mediaItems", "readonly", (s) => s.getAll()); return (rows ?? []).filter((r) => r.sessionId === sessionId); }
export async function loadSessionReport(sessionId: string): Promise<BrowserImportReportRow[]> { const rows = await loadSessionMediaItems(sessionId); return rows.map((r) => ({ path: r.zipPath, status: r.status === "created" ? "uploaded" : r.status === "failed" ? "failed" : "skipped", message: r.error, mediaItemId: r.mediaItemId, productUrl: r.productUrl, bytes: r.size, filename: r.fileName, extension: r.extension, detectedMime: r.detectedMime, sha256: r.sha256, duplicate: r.duplicate, uploadMode: r.uploadMode, attempts: r.attempts, qualityWarnings: r.qualityWarnings, exifDate: r.exifDate, width: r.width, height: r.height, retryable: r.retryable })); }
export async function getIncompleteSessions(): Promise<ImportSessionRecord[]> { const rows = await tx<ImportSessionRecord[]>("importSessions", "readonly", (s) => s.getAll()); return (rows ?? []).filter((r) => !["completed", "partially_completed", "failed", "cancelled"].includes(r.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function clearOldSessions(maxAgeDays = 30): Promise<void> { const cutoff = Date.now() - maxAgeDays * 86400_000; const rows = await tx<ImportSessionRecord[]>("importSessions", "readonly", (s) => s.getAll()); for (const row of rows ?? []) if (Date.parse(row.updatedAt) < cutoff) await tx("importSessions", "readwrite", (s) => s.delete(row.id)); }
