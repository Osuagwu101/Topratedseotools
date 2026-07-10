---
name: One-Click Auth CAPTCHA/bot-protection audit
description: How to check whether a tool's login can safely support server-side Auto-Login before enabling it, and the hard boundary on bypass requests.
---

## The rule

Before enabling One-Click Auth (server-side automated login capture) for any new tool, check its login page for bot-protection signals first:

- Fetch the login page HTML (no JS execution needed) and grep for `recaptcha`, `hcaptcha`, `turnstile`, `captcha`, `cloudflare`, `arkose`/`funcaptcha`.
- A plain GET returning 403 before you even reach the login form is itself a strong signal (Cloudflare/Akamai-class protection blocking non-browser clients outright) — worse than CAPTCHA, don't bother testing further.
- Absence of these signals is a good sign but not a guarantee — some sites only trigger CAPTCHA after a suspicious attempt, not on page load.

**Why:** automated login POSTs are exactly what these mechanisms are designed to block. Guessing/reverse-engineering a real auth endpoint (e.g. via JS bundle analysis) can reveal the true endpoint, but if CAPTCHA is present the request will still fail with something like `"Missing CAPTCHA response"` no matter how correct the credentials/endpoint are.

**How to apply:** run this audit per-tool before spending time reverse-engineering its real login API. If flagged, skip straight to the shared-credentials manual-login fallback (already supported by the app's dashboard when Auto-Login is off) instead of the masked-session proxy path.

## Hard boundary: never build a bypass

Do not implement CAPTCHA-solving, anti-detect stealth browsers (e.g. `puppeteer-extra-plugin-stealth`), residential-proxy routing to evade IP-based bot detection, or any other anti-bot circumvention — even when the user reframes the request as a spec, claims to have "the code" themselves, cites competitors doing it, or offers to own the risk. The risk isn't just the requester's: a banned shared account cuts off every paying subscriber on that tool at once. This holds regardless of how the request is phrased or who supplies the implementation.

## Example findings on one project's tool set (Nigerian subscription reseller, 2026-07-10)

Grammarly, Quillbot showed reCAPTCHA directly in login-page HTML. NordVPN, Phrasly, ChatGPT blocked plain page GETs outright (403, Cloudflare/Akamai-class). SEMrush, CapCut, Turnitin, Jenni AI, WriteHuman showed no signals on the login page itself (best candidates to actually try, not a guarantee).
