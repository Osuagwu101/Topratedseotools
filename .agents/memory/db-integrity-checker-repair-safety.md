---
name: Database Integrity Checker repair-safety model
description: Which classes of data-integrity findings get a one-click auto-repair vs. stay report-only, and why.
---

The integrity checker (scan across products/orders/subscriptions/coupons/referrals for missing, broken,
duplicate, orphaned, and invalid-relationship rows) only auto-repairs a finding when the fix cannot lose or
fabricate business data — everything else is report-only for manual review.

**Rule:** a finding gets a `repair` function only if the fix is one of:
- Nulling/relinking a stale, nullable foreign key on a row that itself stays intact (e.g. entitlement's
  `serverId`/`assignmentId` pointing at a deleted row).
- Re-deriving a value from data that's still authoritative and present (e.g. re-picking a default tool server).
- Deduplicating by demoting all-but-one duplicate to a non-active status (never deleting rows) — the survivor is
  chosen by an explicit, defensible rule (e.g. latest `expiresAt`), not arbitrarily.
- Reusing the exact same code path normal business flow already uses, applied to a case that flow skipped (e.g.
  creating a missing entitlement for an already-`success` order via the same insert shape `activateOrderByReference`
  uses, keyed by `orderId` uniqueness).
- Filtering an array/relationship down to only currently-valid ids (e.g. stripping deleted product ids out of a
  coupon's `productIds`) rather than touching the parent row's identity.

Findings that require judgment calls stay report-only: any missing FK target where the "correct" value is
unknowable (order/product/coupon/referral pointing at something deleted), broken payment/reward records (e.g. a
referral marked reward-granted with no matching credit transaction — could mean the payout failed OR the ledger
entry is missing; fabricating either is unsafe), and near-duplicate coupon codes (DB unique constraint means true
dupes are rare; case/whitespace near-dupes need a human to decide which is canonical).

**Why:** matches the project's hard constraint of never losing or fabricating customer/product/payment/subscription
data. Every repair is logged (append-only audit log) and, where it touches a protected dataset, gated behind the
same `requireDatasetUnlocked`/temporary-unlock mechanism used by Backups/Restore Centre — repairs are never silently
auto-run, and are blocked (423) rather than run when the relevant protected dataset is locked.

**How to apply:** when adding new integrity checks or extending Product/Customer/Payment Recovery Centres, keep
this same test before wiring an auto-repair: "does this ever delete a row, fabricate a value we can't derive, or
touch money/access state ambiguously?" If yes, make it report-only.
