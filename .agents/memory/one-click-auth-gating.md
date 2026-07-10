---
name: One-Click Auth admin gate + reset pattern
description: How SubsHub gates access to a masked/shared tool session behind a single admin-controlled flag, and why re-enabling always forces a fresh login.
---

Per-tool masked/shared sessions (one server IP/device for all subscribers) must be gated behind a single boolean flag checked at *every* entrypoint that can reach the shared session — not just the primary UI button.

**Why:** it's easy to add a new route (autologin redirect, proxy passthrough, admin preview) that reads the shared session cache directly and forgets the gate, silently reopening access after an admin disables it.

**How to apply:** any entrypoint that can trigger use of the shared/master session must independently check the same enable flag from the DB (not trust a cached in-memory session's mere existence as authorization). When the admin flips the flag off, immediately invalidate the cached session(s) too — don't just flip the flag and leave the session live in memory. When flipping on, never resume a stale cached session — always force a fresh login first, so "enable" is equivalent to "re-authenticate now," which keeps the admin's credentials/session state predictable and auditable.
