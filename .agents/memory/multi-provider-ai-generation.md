---
name: Multi-provider AI generation pattern
description: How to add a second LLM provider (e.g. Gemini) as a user-selectable alternative to an existing one (e.g. OpenAI) without scattering provider branching through route code.
---

Add one small provider-agnostic dispatcher module (e.g. `aiClient.ts`) that
exposes a single `generateJson({ provider, model, system, user, ... })`
function which internally calls whichever provider-specific client matches
`provider`. Keep each provider's own client (`openaiClient.ts`,
`geminiClient.ts`) as a thin, independent wrapper with the same call shape
(`{system, user, maxTokens, temperature} -> T`), so prompt builders stay
fully provider-agnostic and only the dispatcher needs to know both providers
exist.

**Why:** the alternative — sprinkling `if (provider === "gemini")` checks
across every route handler — makes it easy to miss a call site when adding a
third provider later, and duplicates error handling per call site.

**How to apply:**
- Settings/config: store a default provider (enum column) plus one model
  field per provider (e.g. `aiProvider`, `aiModel` for OpenAI, `geminiModel`
  for Gemini), not a single generic `model` column — the valid model sets
  differ per provider and a UI needs both to show separate dropdowns.
- Allow a per-request override (e.g. request body `provider`/`model`) that
  takes precedence over the stored default, so a user can switch providers
  at generation time (e.g. when one provider's key/credit runs out) without
  changing global settings.
- Record which provider/model was actually used on each generated
  job/log row, not just "model" — needed later for cost/usage breakdowns.
- Expose which providers have a configured API key via a boolean flag from
  the settings GET/PUT response (never the key itself) so the frontend can
  disable/hide unavailable providers in the picker.
