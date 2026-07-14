---
name: Storage backend abstraction (Hostinger portability)
description: How the app's file storage was made host-portable — key design so future backends/migrations stay consistent.
---

The app's object storage is behind a `StorageBackend` interface (put/get/exists/delete/list/checkHealth) keyed by a logical relative
string, with three swappable implementations: `replit` (original GCS-via-sidecar), `s3` (any S3-compatible provider), `local` (disk +
JSON sidecar for content-type). Non-secret backend config lives in a dedicated single-row DB settings table (mirrors the
`paymentSettings.ts` pattern); S3 access key/secret live in the existing System Configuration Centre encrypted vault, not a new
secrets mechanism.

**Why:** the app previously called Replit's GCS sidecar directly from four+ call sites, so it could only ever run inside a Replit
workspace/deployment. Only the "save + serve via our own route" flow was ever actually used in production — a whole parallel
ACL/presigned-upload code path existed but had zero callers and was deleted rather than ported.

**How to apply:**
- Only one backend is ever "live" for reads at a time — there is no automatic fallback to a previous backend, and switching does
  **not** migrate existing files. Any UI/API around backend switching must say this explicitly; a prior draft's copy claimed "old
  files keep working," which was false and got flagged in review.
- The `replit` backend must search **all** comma-separated `PUBLIC_OBJECT_SEARCH_PATHS` entries for reads (first match wins), not just
  the first — writes/deletes always target the first path. Losing multi-path search on refactor silently 404s objects stored under a
  secondary path.
- The backend factory's in-memory cache key must include the actual S3 secret value (not just the access key id) — rotating only the
  secret while keeping the same key id must still invalidate the cached client, or writes keep using the stale credential.
- Default backend selection (no settings row yet): `replit` only if both `PUBLIC_OBJECT_SEARCH_PATHS` and `REPL_ID` are set; otherwise
  `local`, so a fresh non-Replit deployment works before any admin configuration.
- On the admin PUT-settings endpoint, always preflight-`checkHealth()` the candidate backend and return the result rather than hard
  blocking the save — S3 is legitimately configured in two steps (bucket/region here, then access key/secret in the System
  Configuration Centre separately), so a hard block would break that flow.
