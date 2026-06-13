# Snapchat Export → Google Photos: Production TypeScript Blueprint

## 1. Executive summary
This blueprint defines a production-ready, accessibility-first system using **Next.js (App Router) + TypeScript + Prisma + PostgreSQL + Redis/BullMQ workers**. The architecture separates interactive UI from long-running import jobs, keeps OAuth and upload logic server-side, and ensures all core flows work without 3D/WebGL.

## 2. Feasibility and API reality check
- **Google Photos direct upload is supported** by server-side uploads using the Photos Library upload endpoint followed by media item creation.
- **Drive → Photos transfer is not a native server-side “move/import” API**. Practical approach: app streams bytes from ZIP (or Drive staged file) and uploads to Photos API.
- **Resumable upload**: Photos Library upload flow is chunk-friendly but not a full resumable-session API like Drive. Use retry/backoff + idempotency keys.
- **Album writes** require appropriate scopes and quota handling.
- **Client-side only upload to Photos is not recommended** for this product due to token exposure and job durability concerns.

## 3. System architecture
### Frontend
- Next.js App Router, React Server Components where suitable.
- Accessible components with semantic HTML and ARIA only when required.
- Optional React Three Fiber hero/progress visualization loaded lazily.

### Backend
- Next.js route handlers for auth/session/start-job/queries.
- Worker process (BullMQ) for ZIP scan and media upload jobs.
- Prisma + PostgreSQL for durable state.
- Redis for queue, rate limits, transient locks.

### Auth flow
1. User clicks sign-in.
2. NextAuth Google provider requests minimal scopes.
3. Server stores encrypted refresh token (KMS/secret-managed key).
4. Worker mints access token when processing.

### Upload flow
1. Browser requests signed upload URL.
2. Browser uploads ZIP to object storage (or local temp in dev).
3. Server enqueues `scanZip` job and returns job id.

### ZIP processing flow
1. Validate MIME/signature + max compressed size.
2. Stream archive entries; guard zip-slip and zip-bomb ratio.
3. For each media file: hash (sha256), parse EXIF/timestamps, infer grouping.
4. Persist manifest rows and duplicate candidates.

### Background job flow
- `scanZip` → `reviewReady`.
- User confirms filters/settings.
- `uploadSelected` fan-out per media item with concurrency caps.
- Failed items retriable individually or batch retry.

### Database overview
- users, oauth_accounts, import_jobs, media_items, upload_attempts, preferences, audit_events.

### External services
- Google OAuth, Google Photos API, optional Google Drive API.
- Object storage (S3-compatible object storage/S3).
- Redis, PostgreSQL.

### Security boundaries
- Browser never receives long-lived tokens.
- Worker network egress restricted.
- Signed URLs short TTL.

## 4. UX and accessibility plan
- **Home**: clear CTA, privacy summary, optional decorative 3D hero (aria-hidden).
- **Upload**: keyboard-operable dropzone + file picker; live validation text.
- **Review**: table/grid with selectable rows, date filter, duplicate policy radio group.
- **Progress**: live region announcements for status changes; robust text + icons + color.
- **History**: revisit jobs, export error report CSV.

Screen reader: landmarks, headings, form labels, `aria-live="polite"` progress updates.
Keyboard: logical tab order, visible focus, ESC for dialogs, space/enter toggles.
Reduced motion: disable canvas animation and number tweening; instant transitions.
Mobile/perf: virtualized lists, chunked polling/SSE, compressed thumbnails.

## 5. File/folder structure
```text
apps/
  web/ (Next.js)
    app/
      (marketing)/page.tsx
      dashboard/page.tsx
      jobs/[id]/page.tsx
      api/
        auth/[...nextauth]/route.ts
        uploads/initiate/route.ts
        uploads/complete/route.ts
        jobs/[id]/route.ts
        jobs/[id]/start-upload/route.ts
    components/
    features/
      upload/
      jobs/
      preferences/
    lib/
      auth.ts
      api.ts
      zod.ts
      a11y.ts
  worker/
    src/
      queue.ts
      jobs/scanZip.ts
      jobs/uploadMedia.ts
      services/googlePhotos.ts
      services/googleDrive.ts
      services/zipScanner.ts
packages/
  db/ (Prisma schema + client)
  shared-types/
  eslint-config/
infra/
```

## 6. Database schema (Prisma)
```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  createdAt     DateTime @default(now())
  jobs          ImportJob[]
  oauthAccount  OAuthAccount?
}

model OAuthAccount {
  id                String   @id @default(cuid())
  userId            String   @unique
  provider          String
  encryptedRefresh  String
  scope             String
  createdAt         DateTime @default(now())
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ImportJob {
  id               String   @id @default(cuid())
  userId           String
  status           String
  sourceZipPath    String
  totalDiscovered  Int      @default(0)
  queued           Int      @default(0)
  processing       Int      @default(0)
  uploaded         Int      @default(0)
  skipped          Int      @default(0)
  failed           Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  mediaItems       MediaItem[]
}

model MediaItem {
  id            String   @id @default(cuid())
  jobId         String
  originalPath  String
  mimeType      String
  sha256        String
  takenAt       DateTime?
  inferredAlbum String?
  state         String
  errorCode     String?
  job           ImportJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@index([jobId, state])
  @@index([jobId, sha256])
}
```

## 7. API design
- `POST /api/uploads/initiate` auth required; returns signed URL + job id.
- `POST /api/uploads/complete` marks upload complete and enqueues scan.
- `GET /api/jobs/:id` returns job progress + counters.
- `POST /api/jobs/:id/start-upload` accepts selection payload.
- `POST /api/jobs/:id/retry` retries failed items.

Failure cases: 401 (unauth), 413 (too large), 415 (bad type), 422 (invalid ZIP), 429 (rate), 500/503 transient.

## 8. Implementation plan
1. **MVP**: OAuth, ZIP upload, scan manifest, selection, Photos upload, progress page.
2. **Hardening**: rate limits, malware scanning hook, SSE, structured audit logs, chaos retry tests.
3. **Enhancements**: optional Drive staging, timeline 3D view, advanced dedupe, notifications.

## 9. Actual code (starter)
### NextAuth route
```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/photoslibrary.appendonly",
            "https://www.googleapis.com/auth/drive.file"
          ].join(" "),
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  session: { strategy: "jwt" }
});
```

### Upload initiate handler (zod validated)
```ts
import { z } from "zod";
import { NextResponse } from "next/server";

const Body = z.object({ fileName: z.string().min(1), size: z.number().max(20 * 1024 ** 3) });

export async function POST(req: Request) {
  const body = Body.parse(await req.json());
  // create job + signed URL
  return NextResponse.json({ jobId: "job_123", uploadUrl: "https://signed.example" });
}
```

### ZIP scanner worker
```ts
import yauzl from "yauzl";
import { createHash } from "node:crypto";

export async function scanZip(zipPath: string) {
  return new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName.includes("..")) return reject(new Error("zip slip"));
        // read stream, hash, classify mime, persist
        zip.readEntry();
      });
      zip.on("end", () => resolve());
    });
  });
}
```

### Google Photos upload service
```ts
export async function uploadBytesToPhotos(accessToken: string, bytes: Buffer, fileName: string) {
  const uploadToken = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-type": "application/octet-stream",
      "X-Goog-Upload-Content-Type": "image/jpeg",
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-File-Name": fileName
    },
    body: bytes
  }).then(r => r.text());

  return fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ newMediaItems: [{ simpleMediaItem: { uploadToken, fileName } }] })
  });
}
```

### Accessible upload component
```tsx
export function UploadZipForm() {
  return (
    <form aria-describedby="upload-help">
      <label htmlFor="zip">Snapchat ZIP export</label>
      <input id="zip" name="zip" type="file" accept=".zip" required />
      <p id="upload-help">ZIP only. Max 20 GB. Processing continues in background.</p>
      <button type="submit">Start import</button>
    </form>
  );
}
```

## 10. Accessibility checklist
- Landmarks/headings consistent.
- Focus management for dialogs/toasts.
- Live regions for async progress.
- Contrast ≥ 4.5:1 text.
- Reduced motion respected.
- Pointer + keyboard parity.

## 11. Security checklist
- OAuth offline token encrypted at rest.
- Short-lived signed upload URLs.
- ZIP bomb, zip-slip, MIME spoof checks.
- Queue worker least-privilege service account.
- Structured logs without filenames by default.

## 12. Deployment guide
- Local: docker compose (web, worker, postgres, redis, minio).
- Env vars: GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET, DATABASE_URL, REDIS_URL, STORAGE_BUCKET.
- Deploy: Vercel Functions web + worker, Cloud SQL, Memorystore, encrypted database token storage.

## 13. Testing strategy
- Unit: scanners, dedupe logic, retry/backoff.
- Integration: API + DB + fake queue.
- Accessibility: jest-axe + Playwright.
- E2E: full import fixture.
- Stress: >10GB ZIP with synthetic media.

## 14. Known limitations / next improvements
- Photos API quotas may throttle heavy imports.
- Video transcoding states can delay completion visibility.
- Future: resumable chunk checkpointing, WebTransport progress stream.
