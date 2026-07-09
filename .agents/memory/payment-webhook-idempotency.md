---
name: Payment webhook idempotency pattern
description: How SubsHub makes Paystack webhook-driven activation safe against retries and duplicate events
---

Client-triggered "verify" endpoints must never be the only path to activation — gateways retry
webhooks and users can close the browser before returning to a success page. Both the webhook and
any client-facing verify route should call the same shared "activate" function, keyed by payment
reference, and that function must be idempotent (check for an existing entitlement/record before
inserting, e.g. via a unique constraint + `onConflictDoNothing` or an existence check inside a
transaction).

**Why:** Paystack retries webhook deliveries until it gets an HTTP 200, and the client-side verify
call can race with the webhook. Without a shared idempotent activation path, retries or races
create duplicate entitlements or double-processed orders.

**How to apply:** Extract a single `activateOrderByReference(reference, paidAmount)` (or similar)
function used by both the webhook handler and the verify route. Give it a way to short-circuit if
the order is already activated (unique constraint on the entitlement's order/reference column).
Always re-verify the paid amount server-side against the gateway API inside the webhook — never
trust the webhook payload's amount field alone.
