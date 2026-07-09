---
name: Monnify integration notes
description: Gotchas when integrating Monnify payments (base URL, auth, amount units)
---

- Monnify has two separate base URLs: `https://sandbox.monnify.com` for test/sandbox keys and `https://api.monnify.com` for live keys. Using the wrong one for the key type returns a generic "Invalid authentication credentials" error from `/api/v1/auth/login`, which looks identical to a wrong key/secret — always ask the user which environment their keys are for before debugging further.
- Access tokens from `/api/v1/auth/login` expire; cache in memory and refresh a bit before `expiresIn` elapses rather than re-authenticating on every request.
- Monnify's transaction API expects `amount` in naira (not kobo). If the app stores prices in kobo internally, convert both directions: divide by 100 when calling Monnify, multiply verified `amountPaid` by 100 when comparing back to the stored kobo amount.
- The `transactions/query` (verify) endpoint only returns `amountPaid` for transactions that have actually been paid — for pending/failed transactions the field can be absent, producing `NaN` if you multiply it unconditionally. Default it to 0 before use.
