# Improvement analysis and storage expansion options

_Last researched: 2026-07-24._

## Current baseline

The primary supported path is a static Vercel-hosted React/Vite application that runs the entire Snapchat ZIP import in the browser, authenticates with Google Identity Services, processes ZIP contents with `@zip.js/zip.js`, uploads directly to the Google Photos Library API, and keeps duplicate state/reports in browser storage. The backend, object storage, queue, and database code is explicitly legacy/local experimentation rather than the production path.

This architecture is strong for privacy and cost because user media does not transit project-owned infrastructure. The main tradeoffs are browser quota limits, tab/session fragility, local-only dedupe state, and limited room for cross-device or long-running resumability.

## Highest-value improvements

### 1. Strengthen browser persistence and resumability

**Recommendation:** replace the custom IndexedDB wrapper with a typed storage layer and add a recovery-first session model.

- Use **Dexie.js** for session, media item, upload token, report, and dedupe stores when we need indexed queries, migrations, and transactions. NPM currently lists Dexie `4.4.4` as latest, and Dexie positions itself as an IndexedDB wrapper with offline-first data patterns.
- Use **idb-keyval** only for simple settings or feature flags. NPM currently lists `idb-keyval` `6.3.0` as latest, with no need to adopt it for complex indexed import state.
- Keep fallback in-memory behavior for tests, but make production failures explicit when IndexedDB is unavailable or quota-constrained.
- Persist a resumable work cursor per ZIP entry: path, compressed/uncompressed sizes, hash status, upload status, upload token status, Google Photos create status, and final media item id.

**Why:** the current frontend database manually opens IndexedDB, retrieves all rows for many queries, and has no schema migration strategy beyond version 1. Dexie would reduce persistence bugs and make resumable recovery easier.

### 2. Use browser-local file staging where available

**Recommendation:** add an optional **Origin Private File System (OPFS)** staging layer for large ZIP metadata, generated reports, and temporary extracted blobs.

- MDN describes OPFS as an origin-private storage endpoint under the File System API, not directly visible in the user's normal filesystem.
- web.dev notes OPFS is supported across major browsers and is useful for app-owned file manipulation.
- Use OPFS only as a progressive enhancement, with IndexedDB/local download fallback.
- Do not store full media longer than necessary; define clear cleanup controls and quota warnings.

**Why:** OPFS can improve large-file handling without adding server storage or paid infrastructure, while keeping the privacy model intact.

### 3. Modernize the frontend stack deliberately

**Recommendation:** plan a dependency modernization branch rather than mixing it into feature work.

- **React 19** is stable and available on npm according to the official React blog. Potential benefits include Actions, improved Suspense behavior, ref as prop, and static DOM APIs, but the current app can remain on React 18 until test coverage and third-party compatibility are verified.
- **Vite 8** is the current major Vite line. Vite's official release materials show Vite 8 as stable, and npm currently reports Vite `8.1.5` as latest. Upgrade from Vite 5 through documented migrations and confirm browser target changes.
- **@zip.js/zip.js** remains the right ZIP engine for browser ZIP processing. NPM currently reports `2.8.31` as latest, and the package is designed for browser, Deno, and Node ZIP processing.
- Keep Tailwind 3 unless the UI team is ready for a Tailwind 4 migration pass; update only with visual regression testing because class generation and config expectations can change across majors.

**Why:** the app uses older major versions of Vite, TypeScript, Vitest, jsdom, and React. Updating improves maintenance and security posture but needs a controlled test pass.

### 4. Improve uploads and throttling around Google Photos limits

**Recommendation:** keep direct Google Photos upload as the default destination, then add smarter client-side scheduling.

- Continue using a bounded concurrency default and retry only retryable responses.
- Add adaptive backoff when 429/5xx rates increase.
- Make long-video handling explicit with progress, current file, retry count, and cancellation state.
- Consider using patterns from open-source upload tools such as **Uppy** for queue UI concepts, but do not adopt Uppy wholesale unless it can be cleanly adapted to Google Photos' upload-token/create-media-item flow.
- **tus** is an open resumable upload protocol and is excellent for app-owned storage targets, but it does not directly solve Google Photos uploads unless we introduce a server/storage intermediary.

**Why:** the biggest practical reliability issue is browser/tab/network interruption during long imports, not selecting files.

### 5. Add an optional advanced backend-backed mode, not as the default

**Recommendation:** if the project wants cloud/server storage, add it behind an explicit `advanced` mode and preserve the current free static path.

- Keep browser-only as the default in documentation and environment validation.
- Require explicit opt-in for any bucket/database/queue configuration.
- Use a storage adapter interface that can support local, S3-compatible, Google Cloud Storage, Azure Blob, Supabase Storage, and self-hosted MinIO without coupling import logic to one vendor.
- Treat server-side media staging as sensitive data: signed URLs, short TTLs, lifecycle deletion, encryption at rest, audit logs, and clear user consent.

**Why:** adding hosted storage changes privacy, compliance, and cost assumptions. It is still valuable for large imports, cross-device resume, and unattended processing, but it should not surprise users.

## Storage space options to add

| Option | Best fit | Open source / portability notes | Tradeoffs |
| --- | --- | --- | --- |
| Browser IndexedDB via Dexie | Default persistent manifest, dedupe registry, resumable state | Open-source browser library; no backend | Browser quota, origin/browser profile scoped |
| OPFS | Temporary local blobs, report cache, large manifest files | Web platform API; no vendor lock-in | Availability/quota varies; data is origin-private and not user-visible |
| User-selected local folder via File System Access API | Exporting reports, optional local checkpoints | Web API; user grants access | Browser support differences; permission UX required |
| Local filesystem adapter | Legacy/local CLI or FastAPI development | Already present as `LocalStorageAdapter` | Not useful for public static deployment |
| S3-compatible object storage | Advanced server staging | Portable across AWS S3, Cloudflare R2, Backblaze B2 S3 API, Wasabi, MinIO, DigitalOcean Spaces | Credentials, lifecycle cleanup, cost, data handling obligations |
| MinIO | Self-hosted S3-compatible development or private deployment | Open-source and S3-compatible | User must operate infrastructure |
| Google Cloud Storage | GCP-native backend mode | Uses existing Google ecosystem | Paid cloud dependency; not open source |
| Azure Blob Storage | Enterprise/Microsoft deployments | Broad SDK support | Paid cloud dependency; not open source |
| Supabase Storage | Backend-backed resumable uploads using TUS-compatible flows | Supabase platform includes open-source components; storage supports resumable uploads | Hosted plan limits/costs; not needed for direct Google Photos path |
| WebDAV / Nextcloud | User-owned storage staging | Nextcloud is open source; WebDAV is standardized | Performance and auth variance; more edge cases |
| IPFS-compatible pinning | Experimental archival or distributed staging | Open protocols and open-source nodes exist | Privacy risks, permanence semantics, poor fit for private Snapchat exports unless encrypted client-side |

## Recommended roadmap

### Phase 1: no-infrastructure reliability

1. Introduce a typed Dexie storage module for sessions, media items, completed hashes, reports, and upload tokens.
2. Add OPFS feature detection and use it only for temporary staging/report generation where it improves memory pressure.
3. Add storage quota checks and user-facing warnings before importing very large ZIP files.
4. Improve recovery UI: show incomplete sessions, resume/retry buttons, last-updated timestamps, and cleanup controls.
5. Add a dependency modernization branch for React 19, Vite 8, current Vitest/jsdom/TypeScript, and latest `@zip.js/zip.js`.

### Phase 2: optional local/power-user destinations

1. Add export-to-local-folder support for reports and manifests via the File System Access API where available.
2. Add a documented local-only backend profile using the existing local storage adapter for development and power users.
3. Add a provider-neutral storage interface for staged ZIPs/media with lifecycle metadata.

### Phase 3: advanced cloud-backed mode

1. Add S3-compatible storage first because it covers AWS S3, R2, B2, Wasabi, MinIO, and Spaces with one adapter family.
2. Add Google Cloud Storage only if GCP deployment is revived.
3. Add Supabase Storage/TUS only if the project introduces user accounts or a managed backend mode.
4. Add queue/worker execution only after storage and manifest consistency are robust.

## Technologies to evaluate next

- **Dexie.js 4.x** for IndexedDB schema, transactions, indexed queries, and live import progress reads.
- **OPFS** for origin-private temporary file data and lower-memory processing.
- **React 19** for frontend modernization after compatibility testing.
- **Vite 8** for current build tooling and ecosystem support.
- **@zip.js/zip.js 2.8.x** for updated ZIP processing while preserving the current architecture.
- **Uppy** for upload queue UX ideas if a future non-Google-Photos destination is added.
- **tus/tusd** for resumable uploads only in advanced storage modes that include a server or object-store intermediary.
- **MinIO** as the best open-source S3-compatible target for local/private advanced mode testing.

## Key external references

- React 19 stable release: https://react.dev/blog/2024/12/05/react-19
- Vite 8 announcement and releases: https://vite.dev/blog/announcing-vite8 and https://vite.dev/releases
- `@zip.js/zip.js` package: https://www.npmjs.com/package/@zip.js/zip.js
- Dexie package and project: https://www.npmjs.com/package/dexie and https://dexie.org/
- idb-keyval package: https://www.npmjs.com/package/idb-keyval
- MDN OPFS reference: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- web.dev OPFS article: https://web.dev/articles/origin-private-file-system
- Uppy project: https://uppy.io/
- tus protocol: https://tus.io/
- tusd reference server: https://github.com/tus/tusd
- Supabase resumable uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
