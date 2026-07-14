---
name: Migration/restore diff engine reuse
description: Reuse the existing backup-vs-live diff primitive for any new comparison feature; never let an unchecked category read as a pass.
---

For any feature that compares a backup snapshot to the live database (migration validation, a disaster-recovery step, etc.), reuse the existing restore-preview diff engine rather than writing a second table-diffing implementation — it already handles partial-table, file, and full-database-dump comparisons.

**Rule: an unverifiable check must never be reported as a pass.** A comparison can only be "checked and matches" when the live count/value was actually read; if the live side couldn't be determined for some part of the data, the overall result must say so explicitly (e.g. a separate "inconclusive" state), not silently count as success alongside genuine matches.

**Why:** in a data-safety context, "unknown" and "match" look identical to an admin skimming a green checkmark, but they carry opposite risk — this was flagged in review as a functional reliability gap, not a cosmetic one.
