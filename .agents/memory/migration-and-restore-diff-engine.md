---
name: Migration/restore diff engine reuse and pg_dump parsing gotcha
description: previewRestore is the one comparison primitive for "backup vs live" features; a subtle regex bug in its SQL-dump row counter and its known table-coverage gap.
---

`previewRestore` (restoreEngine.ts) is the single reusable "compare a backup snapshot against the live database" primitive — it already handles partial-table-scope diffs, downloads-scope diffs, and full/database SQL-dump row-count summaries. Any new feature that needs to compare a backup to live data (Migration Validation, a future Disaster Recovery Wizard step, etc.) should call `previewRestore` and re-group/re-label its output rather than re-implementing table diffing.

**Two real gaps found while building Migration Validation on top of it:**

1. Its SQL-dump row counter parsed `COPY ... FROM stdin;\n<body>\n\.` by requiring two newlines before the terminator. pg_dump only emits **one** newline for an empty table (`FROM stdin;\n\.\n`), so the regex silently failed to match empty tables and the lazy capture group ran on into the *next* table's COPY block — misattributing that table's row count to the empty one. Fixed by anchoring on a bare `^\.$` line and counting `\n` occurrences in the body instead of splitting on it.
2. `TABLE_MAP`/`SQL_TABLE_BY_NAME` (the table-name → Drizzle-table lookup used to fetch a live row count for comparison) only covers the tables used by partial backup scopes (products/orders/users/purchases/settings/downloads) — coupons, referral data, staff accounts, and website-content tables (blog posts, reviews, testimonials) appear in a `full`/`database` SQL dump's per-table summary but their live count comes back `null` ("not checked") because they aren't in the map. Any full-database restore preview or migration validation involving those tables can only report the backup-side count, not a match/mismatch.

**Why this matters:** a wrong or missing count reads as false confidence (or a false mismatch alarm) in a data-safety feature — exactly the kind of silent failure these tools exist to prevent.
