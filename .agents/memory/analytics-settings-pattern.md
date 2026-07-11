---
name: Analytics settings DB-first pattern
description: How tracking IDs and CAPI token are stored and served — architecture decisions for analytics/tracking config.
---

## Rule
All analytics configuration (Meta Pixel ID, GTM Container ID, CAPI access token, test event code, site URL, enabled flags) lives in the `analytics_settings` DB table (singleton row id=1), not in VITE_ build-time env vars.

## Architecture
- Table: `analytics_settings` in `lib/db/src/schema/analyticsSettings.ts`
- Server lib: `artifacts/api-server/src/lib/analyticsSettings.ts` — encrypt/decrypt/mask token, read/write helpers
- Encryption: AES-256-GCM, key = SHA-256 of `"analytics-token-key:" + SESSION_SECRET`; format stored: `iv_hex:authTag_hex:ciphertext_hex`; no new env var needed
- Public endpoint: `GET /api/tracking/config` — returns only `{ metaPixelEnabled, metaPixelId, gtmEnabled, gtmContainerId }` — never exposes token
- Admin endpoints: `GET /api/admin/integrations`, `PUT /api/admin/integrations/meta-pixel`, `PUT /api/admin/integrations/meta-capi`, `PUT /api/admin/integrations/google-tag-manager`, `POST /api/admin/integrations/meta-capi/test`
- Frontend: `analytics.ts` uses mutable `let runtimePixelId/runtimeGtmId` + `setTrackingConfig()` called from App.tsx after fetching /api/tracking/config at startup
- `metaCapi.ts` calls `getCapiRuntimeSettings()` on each `sendCapiEvent()` call (reads from DB with env-var fallback)

**Why:** VITE_ vars require a rebuild to change; secrets like CAPI token must never reach the browser bundle; admin should be able to update Pixel/GTM IDs without a deployment.

**How to apply:** When adding new integration settings, follow the same singleton-table + encrypt-if-secret + public-safe-endpoint pattern. Never add analytics secrets to env vars or VITE_ vars.
