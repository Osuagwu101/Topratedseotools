---
name: Restore Manager scope semantics
description: Why partial-scope, downloads-scope, and full-scope restores use different write semantics.
---

The Restore Manager derives restore scope from the backup's own recorded `scope` (no separate scope parameter at
restore time), and each scope uses a different, deliberately-chosen write strategy:

- **Partial scopes** (products/orders/users/purchases/settings): transactional per-table "replace" — delete current
  rows not present in the backup snapshot, then upsert (insert/`onConflictDoUpdate`) the snapshot's rows, keyed by
  integer `id`. This makes the table match the backup exactly.
- **`downloads` scope**: upsert-only. Re-uploads file bytes present in the backup but never deletes files that exist
  now but aren't in the backup snapshot — file storage is treated as append-safe, not a mirror.
- **`full`/`database` scope**: pipes the stored `sqlDump` through `psql --single-transaction -v ON_ERROR_STOP=1`;
  `pg_dump` must be run with `--clean --if-exists` so the dump is self-contained (dumps taken before this flag was
  added are not restorable this way).

**Why:** "replace" semantics are correct for structured tables where the backup should become the source of truth,
but destructive-by-default would be wrong for files (once deleted, bytes are gone) and wrong for a raw SQL dump
(psql handles its own transaction/rollback, don't pre-process it).

**How to apply:** any new backup/restore-adjacent feature (Disaster Recovery Wizard, Product/Customer/Payment
Recovery Centres) should keep this same per-scope split rather than inventing a new restore strategy, and should
reuse the mandatory "take a fresh pre-restore safety backup before applying" step already built into
`executeRestore`.
