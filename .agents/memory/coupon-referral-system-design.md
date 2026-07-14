---
name: Coupon & referral system design decisions
description: Non-obvious money-flow decisions in the coupon/referral/store-credit system that future checkout, email, or guest-checkout work must stay consistent with.
---

- Discounts are applied to the order's base amount **before** tax/fee computation, not after — so a coupon reduces the taxable base, not just the final total.
- Coupon usage counters only increment on successful payment (order activation), never at order creation — so an abandoned/failed order never consumes a limited-use code.
- Store credit is debited **at order-creation time** (immediately), not at payment success, to prevent a customer from double-spending the same credit balance across two concurrent pending orders. If the order later fails, the credit is refunded automatically.
- Referral fraud prevention combines three checks: self-referral block, shared-email block, shared-device block (via device session fingerprinting) — plus a DB-level uniqueness constraint on the referred user, so a given customer can only ever be referred once.
- Referral reward delivery has two shapes: `percentage`/`fixed`/`store_credit` reward types pay out as wallet credit; `free_product` pays out as a direct complimentary tool entitlement. A `maxRewardsPerReferrer` cap stops paying out once reached, but the referral still counts as "completed" past the cap.
- Referral code attribution is captured client-side from a `?ref=CODE` query param (mirrors the existing marketing-attribution capture) and passed as a request header at order creation — resolution into an actual reward happens only after successful payment, and that resolution function is designed to never throw, so a referral-processing bug can't block a customer's purchase/entitlement.

## Concurrency/idempotency pattern for money-moving flows
Any flow that reads a balance/status and later acts on it (spend credit, pay a reward, activate an order, refund on failure) needs an explicit concurrency guard — a plain read-then-write is a double-spend/double-pay race under concurrent requests (webhook + client poll, two near-simultaneous checkouts, retried webhooks).
**Why:** a completion-review pass caught three separate races of this shape in the same feature (order activation redeeming a coupon twice, failure-refund double-crediting on retried webhook events, and store-credit/referral-reward races) — the pattern recurs any time "check current state, then mutate" isn't done atomically.
**How to apply:** prefer one of two patterns depending on the shape:
1. **Row lock for the duration of a decision + write** — `SELECT ... FOR UPDATE` (or lock-then-read a balance row) inside a `db.transaction`, so a concurrent caller blocks until the winner commits and then observes the already-updated state. Used for order activation and store-credit debiting at checkout.
2. **Atomic conditional-update claim** — a single `UPDATE ... WHERE <still-in-claimable-state> RETURNING` (e.g. `status != 'failed'`, or `status = 'pending'`); zero returned rows means another caller already claimed it, so bail out without repeating the side effect (refund, reward payout, entitlement grant). Used for idempotent failure-refunds and referral-reward settlement.
Insert-time idempotency (a unique constraint + `onConflictDoNothing` before incrementing a counter) is a good third option when the side effect is "insert a ledger/redemption row once" — used for coupon redemption records.
