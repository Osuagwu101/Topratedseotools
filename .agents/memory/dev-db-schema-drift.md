---
name: Dev DB schema drift after drizzle schema edits
description: A column/field added to a lib/db schema file can be missing from the actual dev Postgres table if `drizzle-kit push` was never run for that change.
---

Adding a column to a `@workspace/db` schema file (e.g. `lib/db/src/schema/*.ts`) only updates the TypeScript types. The dev database table itself is not migrated until `pnpm run push` is run from `lib/db` (wraps `drizzle-kit push`).

**Why:** Found this when a previously-added settings column (`warningThresholdPercent`) existed in the schema and typechecked fine, but every route that read the row failed at runtime with `column "..." does not exist` — the schema change had never been pushed to the dev DB.

**How to apply:** If a route/query fails at runtime with a Postgres "column does not exist" error but the column is clearly present in the Drizzle schema file, don't assume the code is wrong — run `pnpm run push` in `lib/db` first (dev only; production schema changes go through the Publish flow, never a manual push) and retest.
