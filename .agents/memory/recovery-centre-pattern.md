---
name: Recovery centre pattern (missing-row restore)
description: How "X Recovery Centre" one-click actions (Product/Customer/Payment) should detect and restore missing rows without touching orders/purchases.
---

Any "<Entity> Recovery Centre" (Product, Customer, Payment, ...) built on top of the existing Backup/Restore/DB-Integrity engines should follow this shape, not reinvent scanning or restore logic:

1. **Detect "missing"** by cross-referencing every other table that stores a foreign id pointing at the entity (e.g. orders.productId, entitlements.productId, coupons.productIds[]) against the entity's own table. An id referenced elsewhere but absent from the entity table is "missing." Never infer missingness from the Database Integrity Checker's `sample` field alone — it's capped (10 rows) and won't give you the full missing-id set.
2. **Recover data** only from a completed backup of that entity's scope (`backupsTable` row with `status: "completed"` and a readable `storagePath`), via `loadEnvelope` (exported from `restoreEngine.ts`) — reinsert by exact id (`onConflictDoNothing`) so an existing row is never clobbered even if the backup's version differs.
3. **Never touch the referencing rows** (orders, entitlements, etc.) — those are only used to build the "which ids are missing" list, never written to.
4. **Handle a missing/corrupt backup artifact gracefully** — `loadEnvelope` throws if the storage object bytes are gone (local storage backend is ephemeral in dev and can lose files across restarts/cleanups); catch this and report a `partial` result ("needs manual recreation") instead of a 500.
5. Gate any write path on the entity's key in the existing Protected Data registry (`protectedData.ts`'s `isDatasetUnlocked`/`getDatasetDefinition`), matching how Backup/Restore/DB-Integrity already gate.

**Why:** Product Recovery Centre hit exactly this — a real dev-environment products table had gone empty (products purged by earlier Restore Manager testing) with `tool_entitlements` still referencing a deleted product id, and one of the two available "products" backups had already lost its storage bytes. Building restore-missing generically against backups (rather than hardcoding one table) plus graceful missing-artifact handling made it correctly recover the one restorable row and clearly report the other as unrecoverable.

**How to apply:** Reuse this shape verbatim for Customer Recovery Centre and Payment Recovery Centre (both already queued as separate tasks) — swap the entity table and its FK-holding tables, keep the detect/recover/never-touch-referencing-rows/graceful-failure structure.
