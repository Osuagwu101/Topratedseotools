---
name: SubsHub payment provider history
description: Payment provider went Paystack -> Monnify -> back to Paystack; context for why
---

SubsHub migrated from Paystack to Monnify, then reverted back to Paystack in the same project. Reason: only sandbox Monnify keys were available, and going live required live Monnify keys the user could not locate in their dashboard, so they asked to switch back to Paystack with new keys instead.

**Why this matters:** if asked to integrate/re-integrate Monnify for this project again, confirm the user actually has *live* Monnify API key/secret/contract code in hand before doing the migration — sandbox-only keys can't go to production and previously caused a dead end.

**How to apply:** Both Paystack and Monnify route implementations follow the same pattern (server sources amount/email from the DB order, verify endpoint rechecks paid amount against `order.amountKobo` before marking success) — this pattern should be preserved regardless of which provider is active.
