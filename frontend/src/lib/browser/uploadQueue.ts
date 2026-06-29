export const DEFAULT_UPLOAD_CONCURRENCY = 3;
export const MAX_UPLOAD_CONCURRENCY = 5;
export const BATCH_CREATE_SIZE = 50;
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 50 * 1024 * 1024;

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function isRetryableStatus(status?: number): boolean {
  return status == null || [429, 500, 502, 503, 504].includes(status);
}

export async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, MAX_UPLOAD_CONCURRENCY));
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function retry<T>(operation: () => Promise<T>, options: { maxAttempts?: number; isRetryable?: (error: unknown) => boolean; onRetry?: (error: unknown, attempt: number, delayMs: number) => void; sleepMs?: (ms: number) => Promise<void>; } = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleepMs ?? ((ms) => new Promise((resolve) => window.setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      if (attempt >= maxAttempts || options.isRetryable?.(error) === false) throw error;
      const delayMs = 500 * 2 ** (attempt - 1);
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw new Error("Retry failed unexpectedly");
}
