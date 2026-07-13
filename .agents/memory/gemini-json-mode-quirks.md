---
name: Gemini JSON mode quirks
description: Model naming and JSON-parsing pitfalls when calling Gemini's generateContent with responseMimeType "application/json" via @google/genai.
---

## Dated model IDs get retired fast
Dated snapshot IDs like `gemini-2.5-flash` or `gemini-2.5-flash-lite` can return
`404 "This model ... is no longer available to new users"` for a freshly issued
API key, even though `ai.models.list()` still lists them as existing models.
Use the `-latest` alias family instead (e.g. `gemini-flash-latest`,
`gemini-flash-lite-latest`, `gemini-pro-latest`) — Google keeps these valid by
rolling the underlying model forward, so they don't go stale the way dated
IDs do. Note the "pro" alias can hit 429 quota errors on a free-tier key even
when flash aliases work fine; don't assume a 429 is a code bug.

**Why:** discovered via direct SDK probing when Gemini calls threw 404s for a
just-created `GEMINI_API_KEY` and `gemini-2.5-flash` despite it being the
official current-gen model name in Google's docs.

**How to apply:** whenever wiring a Gemini text-generation call, default to
`gemini-flash-latest` (or `-lite` for cheaper), not a dated snapshot. If a
model 404s for "no longer available to new users", swap to the `-latest`
alias rather than trying older snapshot names.

## JSON response mode can still return malformed JSON
With `config.responseMimeType: "application/json"`, Gemini can return text
that is *not* valid JSON even when `finishReason` is `"STOP"` (i.e. not a
`MAX_TOKENS` truncation) — observed cases: a missing final closing brace, and
a stray extra closing brace appended after an otherwise-complete object. Do
not trust `JSON.parse(response.text)` unconditionally.

**Why:** encountered this while wiring per-request generation for an
SEO-article generator — smaller prompts often parsed fine, but longer HTML
generations intermittently failed with clearly malformed but simple defects
(one brace off), not truncation from hitting `maxOutputTokens`.

**How to apply:** wrap Gemini JSON calls in a lenient parser: strip markdown
code fences, then scan from the first `{` tracking string/escape state and
brace/bracket depth. If depth returns to zero, parse exactly that substring
(this drops trailing garbage). If the string runs out before depth reaches
zero, close any open string then append closers for the remaining open
braces/brackets (this repairs truncation). Only throw if both attempts fail.
This is provider-specific — OpenAI's JSON mode has not shown this behavior.
