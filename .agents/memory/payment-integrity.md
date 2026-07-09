---
name: Payment integrity pattern
description: Rule for preventing client-side amount/email tampering in checkout flows
---

Never trust client-supplied `amount`/`email`/price fields when initializing a payment with a gateway (Paystack, Monnify, Stripe, etc). A technical user can intercept the request and lower the amount while keeping a valid order reference.

**Why:** Found in this project — the checkout initially sent `amountKobo` and `email` from the browser straight through to the payment gateway's initialize call, and the verify step only checked `status === "success"` without comparing the amount paid to the order's actual price. This allowed underpayment while still unlocking access.

**How to apply:** On the server, always re-fetch the order from the DB using only the `orderId`, and use the DB's `amountKobo`/`customerEmail` for the gateway call. On verification, compare the gateway-reported paid amount against the DB order amount before marking the order successful; if it's less, mark the order failed instead.
