---
name: Per-entitlement server assignment
description: Pattern for supporting multiple independent credential pools per product/tool, keyed by the entitlement rather than the product.
---

When a single product/tool can have multiple independent backing accounts (e.g. multiple Phrasly logins to spread load or avoid concurrent-session bans), assign the specific credential pool at the entitlement level, not the product level.

**Why:** if access is resolved by "look up the product's credentials," every subscriber on that tool collides on the same account. Different users need different accounts, and which one they get must persist (survive expiry checks, re-logins, proxy requests) rather than being decided fresh on every request.

**How to apply:**
- Add a nullable `serverId`-style FK on the entitlement/subscription row, not just the product.
- Resolve access with: entitlement's assigned server first, falling back to the product's first "auto" server for legacy rows created before this existed.
- Any code path that grants access (payment webhook, manual admin grant, etc.) must accept an optional server/pool id and persist it at grant time so later access checks are consistent.
- Keep a single shared "resolve access for this user+product" helper reused by every consumer (proxy, autologin routes, dashboards) so they can't drift.
