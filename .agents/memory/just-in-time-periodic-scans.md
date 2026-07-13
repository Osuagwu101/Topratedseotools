---
name: Just-in-time periodic scans
description: Pattern for "periodic" background-feeling features in this codebase, which has no cron/worker infrastructure.
---

This codebase has no background job scheduler or cron worker. Any feature that
sounds "periodic" (e.g. a scan that should run every N hours) is implemented
as a just-in-time recompute, not a scheduled job:

- Add a `lastXScanAt` timestamp column to the relevant settings table.
- On the read/GET endpoint the frontend polls, check if `now - lastXScanAt`
  exceeds a staleness threshold (e.g. 12h). If stale, run the recompute
  inline before responding, then update `lastXScanAt`.
- The frontend just polls the GET endpoint on an interval (e.g. every 5 min,
  see `MonthlyUsageBanner`) — it never triggers the recompute directly except
  via an optional explicit "rescan now" action gated to administrators.

**Why:** Established for the monthly-usage-cap banner and reused for the
AI Generator's internal-link insights (broken links + link-opportunity
suggestions). Keeps all "periodic" work on one consistent, cron-free pattern.

**How to apply:** When asked for a new periodic/background check, look for an
existing settings table to add a `lastXScanAt` column to, and fold the
recompute into an existing or new GET endpoint rather than reaching for a
job queue, external scheduler, or `setInterval` on the server.
