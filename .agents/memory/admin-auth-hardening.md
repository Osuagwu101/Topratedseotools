---
name: Admin Basic-Auth hardened without a frontend rewrite
description: Pattern used to replace a shared-secret admin login with per-person, auditable accounts while keeping the existing Basic-Auth frontend untouched.
---

When an admin frontend sends `Authorization: Basic <user:pass>` built from a single shared env-var credential, you don't have to rewrite the frontend to cookie/session auth to fix the "one shared secret, no audit trail" problem.

Keep the frontend exactly as-is (same Basic-Auth header), but swap what the server checks it against: decode the header server-side and verify against a real per-person `staff_users` table (hashed passwords) instead of comparing to static env-var strings. This gives per-person login and an audit trail with zero frontend changes.

**Why:** A full auth rewrite (frontend + backend) is high blast-radius on a production app where breaking admin access is costly. This gets the security win (no more shared secret, real audit trail) with a much smaller, lower-risk diff.

**How to apply:**
- Add a single shared `requireX` middleware that does the Basic-Auth decode + DB lookup once; have every route file that previously duplicated its own `requireAdmin` import and alias to it instead of reimplementing the check.
- Bootstrap the first real account once at server startup from whatever legacy env-var credential existed (if present), rather than keeping the env-var comparison as a permanent fallback path.
- Watch for auto-login bridges layered on top of the old shared-secret check (e.g. a middleware that silently signs in *any* request matching the shared secret as a privileged session for an unrelated subsystem) — these need to be removed too, or the hardening is undone by a side door.
