# Migration Readiness (Replit → Hostinger)

**Status:** Live tooling exists in the Super Admin dashboard under **Operations Centre → Migration Readiness**. This document explains what it checks and how to use it. It supersedes the storage-related claims in `MIGRATION_ANALYSIS.md` §3/§8/§10/§12, which was written before the storage-backend abstraction (local/S3/Replit) existed — object storage is no longer hard-wired to a Replit-managed GCS bucket.

## What the tool does

1. **Migration Readiness report** (`GET /admin/migration-readiness`) — enumerates every category of business data the app owns (products, orders, payment history, customer accounts, subscriptions/entitlements, coupons, referrals, AI/email/payment configuration, website settings, analytics, staff accounts, and images/uploads/downloads) and reports, per category:
   - Where it lives (Postgres, the object-storage backend, or an external SaaS).
   - A current record/object count, for an at-a-glance sanity check.
   - Whether it is portable to a plain Postgres + disk host (like Hostinger) **today**, with no code changes.
   - Any blocker or caveat — the only real blocker today is having the object-storage backend set to `"replit"` (Replit's managed bucket); switching it to `"local"` or `"s3"` in the Storage Manager makes that category portable too.

2. **Migration Validation** (`POST /admin/migration-readiness/validate/:backupId`) — takes an existing backup (from the Backups panel, any scope) and compares it against the live database, grouped by the same business categories, reusing the Restore Centre's existing diff engine (`previewRestore`) rather than a second implementation. Use this to confirm an export snapshot still matches production before/after a migration dry run.

## Why Postgres and the storage abstraction are already portable

- The database layer is a standard `pg`/Drizzle setup against `DATABASE_URL` — any Postgres 16 instance works, including one running on or reachable from a Hostinger VPS. A `pg_dump`/`pg_restore` (or one of the app's own `full`/`database`-scope backups) carries every row across untouched.
- File storage goes through a single abstraction (`artifacts/api-server/src/lib/storage`) with three interchangeable backends: `local` (disk), `s3` (any S3-compatible bucket), and `replit` (Replit's managed bucket, via `PUBLIC_OBJECT_SEARCH_PATHS`). Only `replit` is non-portable. The app-facing URL contract (`publicObjectUrl`) never changes when the backend changes, so switching backends before migrating requires configuration only, not a rebuild.
- Customer identity lives in Clerk (an external, host-agnostic service), not in this app's Postgres. Moving hosts only means re-pointing this app's Clerk environment variables at the new host; Clerk itself does not need to move.

## Using it before a real migration

1. Open **Migration Readiness** and confirm every category shows portable. If "Images, Uploads & Downloads" is not portable, switch the Storage Manager's backend to `local` or `s3` and re-check.
2. Take a `full` (or `database`) scope backup from the Backups panel.
3. Run Migration Validation against that backup to get a baseline "everything matches" confirmation.
4. Perform the actual migration steps in `MIGRATION_ANALYSIS.md` §12 (out of scope for this tool — it validates readiness and data integrity, it does not move data itself).
5. After cutover, take a fresh backup on the new host and re-run Migration Validation against the pre-migration backup to confirm nothing was lost.
