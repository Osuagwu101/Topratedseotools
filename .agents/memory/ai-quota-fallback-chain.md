---
name: AI quota fallback chain for SubsHub SEO generator
description: How automatic provider/model fallback works when Gemini or OpenAI quota is exhausted, and its limits.
---

The AI SEO Article Generator (`artifacts/api-server/src/lib/seoGenerator/aiClient.ts`,
`generateJsonWithFallback`) automatically retries on quota/rate-limit errors
(HTTP 429, `RESOURCE_EXHAUSTED`, "exceeded your current quota") before giving
up. All four generator call sites (keyword research, content brief, full
article, section regeneration) route through it.

Fallback order:
1. Other Gemini models (`ALLOWED_GEMINI_MODELS`) if the requested provider
   was Gemini — each Gemini model has its own independent free-tier daily
   quota, so a sibling model often still has headroom even when the
   requested one is capped.
2. The other provider's default model, if its API key is configured.

Non-quota errors (bad prompt, unparsable JSON, missing API key) are not
retried — they fail immediately since retrying would just repeat the same
failure.

**Why:** Gemini's free tier caps each model at ~20 requests/day
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`), separate from any
per-minute rate limit. OpenAI billing lapses show up as plain 429s too. Without
a fallback chain, hitting either cap broke article generation outright in
production.

**How to apply:** This is not a full fix for capacity — if every configured
provider/model is genuinely out of quota or unbilled, generation still fails
(with an aggregated error message). Don't claim "quota problems are fixed"
without confirming at least one provider has real headroom (paid OpenAI
billing, or a Gemini paid tier) for sustained production use.
