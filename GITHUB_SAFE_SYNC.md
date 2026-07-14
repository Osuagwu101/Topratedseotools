# GitHub-Safe Synchronisation Review

This document records the code/data separation guarantee for this project and
what was checked to confirm it, so future changes can be reviewed against the
same bar.

## The guarantee

**Git (push/pull/GitHub) only ever moves application code, schema
definitions, and non-sensitive static config. It never moves business data.**

All business data — customer accounts (mirrored locally from Clerk), orders,
payment history, subscriptions/entitlements, coupons, referral records,
credit balances, downloadable files, site settings, and analytics events —
lives exclusively in:

- **Postgres** (`DATABASE_URL`), accessed through `@workspace/db` — never
  serialized into a repo-tracked file.
- **Object storage** (Replit App Storage / S3-compatible / local disk, see
  `artifacts/api-server/src/lib/storage/`) — files live in a bucket or on
  disk, addressed by key; nothing is copied into the repo.

Schema itself (table/column definitions in `lib/db/src/schema/`) is code and
is tracked — that's expected and desired. What must never be tracked is the
*rows* in those tables.

## What was audited

1. **Committed business-data-shaped content.** Searched the full repo for
   seed/fixture files, committed CSV/SQL/JSON exports, and any file
   containing real-looking customer/order data. None found — `git ls-files`
   turns up no seed scripts, no data exports, and no `.env`-style file with
   live secret values (secrets are managed exclusively through Replit
   Secrets, injected as environment variables at runtime; see the
   `environment-secrets` skill).

2. **Local-disk storage backend and backup artifacts.** The optional local
   storage backend (`artifacts/api-server/src/lib/storage/localBackend.ts`,
   used when an admin selects "local" storage — e.g. targeting a
   single-server Hostinger VPS deployment) and the Backup/Restore Centre
   (`backupEngine.ts`) both write real file/database content to
   `storage-data/` by default (configurable via
   `storage_settings.local_dir`). This directory is git-ignored —
   `artifacts/api-server/.gitignore` already excluded it, and the root
   `.gitignore` now also excludes `storage-data/` and `**/storage-data/` as
   a second layer of defense in case the directory is relocated or a similar
   pattern is reused elsewhere in the monorepo. Verified with
   `git check-ignore` against an actual backup artifact
   (`storage-data/backups/products-*.json.gz`) produced during Task
   #31/#32 testing: correctly ignored, never tracked.

3. **Schema/migration review.** This project has no versioned migration
   files — schema changes are applied directly via `drizzle-kit push`
   (`lib/db`'s `push`/`push-force` scripts) against the schema defined in
   `lib/db/src/schema/`. There is therefore no migration history that could
   contain a `DROP TABLE`/`TRUNCATE` against a business table. Searched the
   full codebase for `DROP TABLE`/`TRUNCATE` regardless — none exist. If
   versioned migrations are introduced later, re-run this check against the
   migration files before merging.

4. **Production data changes.** Production schema/data changes are applied
   through Replit's own Publish flow (see the `database` skill), not by
   pushing code that runs destructive SQL — consistent with the Deployment
   Safety centre's existing explanation shown in the admin panel
   (`artifacts/api-server/src/lib/deploymentSafety.ts`).

## Result

No violations found. One gap was closed: the root `.gitignore` did not
previously mention `storage-data/`, relying solely on the nested
`artifacts/api-server/.gitignore`. Both are now in place.

## Keeping this true going forward

- Never write a script that dumps real rows from `products`, `orders`,
  `tool_entitlements`, `staff_users`, etc. into a repo-tracked file, even
  temporarily for debugging — use a `/tmp` path instead.
- If a new local-disk-backed feature is added, make sure its data directory
  is added to `.gitignore` before the first write, not after.
- If versioned migrations are introduced, review every new migration file
  for `DROP TABLE`/`TRUNCATE`/unconditional `DELETE` against a business
  table as part of code review, the same way this document checked the
  current (migration-free) setup.
