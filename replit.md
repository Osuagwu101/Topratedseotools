# Top Rated SEO Tools (formerly SubsHub)

A subscription services storefront where users can browse and purchase monthly access to popular productivity and AI tools. Payments are processed via Paystack.

Public-facing brand name is "Top Rated SEO Tools" — homepage headline: "Everything You Need to Get More Done With AI".

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (already provisioned)
- Required env: `PAYSTACK_SECRET_KEY` — Paystack secret key (falls back to `PAYSTACK_API_KEY` if unset) — already set
- Auth: Replit-managed Clerk (`CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`VITE_CLERK_PUBLISHABLE_KEY`) — already provisioned, dev keys in use during development (expected)
- Workflows are configured for all three artifacts (store, api-server, mockup-sandbox) and start automatically

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Payments: Paystack

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (products, orders)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/store/src/pages/` — React pages (home, product, checkout, success)
- `artifacts/store/src/components/` — Shared UI components

## Architecture decisions

- Paystack payment flow: create order → initialize payment (server builds checkout with DB-sourced amount/email) → redirect to Paystack checkout → customer returns to `/success?reference=...` → verify on return
- The Paystack **webhook** (`POST /api/paystack/webhook`) is the source of truth for activation — it verifies the signature (HMAC SHA512 of the raw body), re-verifies the transaction server-side, then calls the shared `activateOrderByReference` helper. The client-triggered `/paystack/verify/:reference` route calls the same helper, so both paths produce identical, idempotent results (safe against Paystack's webhook retries and user double-visits)
- Verify/webhook re-check the amount actually paid against the order's `amountKobo`; underpayment marks the order `failed`/`underpaid` instead of `success`
- `tool_entitlements` table (not `orders.status` alone) is the access-control source: one row per activated order with `status` + `expiresAt`. Dashboard and the auto-login proxy both check `expiresAt > now()`, so expired subscriptions lose access automatically without a cron job
- Orders have a `durationMonths` (1/3/12) captured at creation; entitlement `expiresAt` is computed as `now() + durationMonths` at activation time
- Prices stored in kobo (1 NGN = 100 kobo) throughout, matching Paystack's API (which also expects/returns amounts in kobo) — no unit conversion needed for Paystack, unlike the brief Monnify migration
- `billingPeriod` is either "monthly" or "per_check" (Turnitin)
- Orders get a unique `reference` (SUB-XXXX, DB-unique) at creation time, used as Paystack's `reference` for matching
- Logged-in checkout skips the name/email form entirely — customer name/email are sourced from the Clerk profile, since there is no guest-checkout path
- `tool_servers` table supports multiple independent credential sets ("servers") per product (replacing the old one-credential-per-product model). Each `tool_entitlements` row stores the specific `serverId` it was granted against, so different subscribers on the same tool can be spread across different backing accounts. Proxy/autologin resolve access via `resolveServerForUser` (in `lib/toolAccess.ts`), which prefers the entitlement's assigned server and falls back to the product's first auto-login server for legacy rows with no `serverId`
- Admin panel (`/admin`, HTTP Basic auth via `ADMIN_USERNAME`/`ADMIN_PASSWORD`) supports: per-product tiered pricing edits, full CRUD on `tool_servers`, Clerk user search/creation (`clerkClient.users`), manual entitlement grants (`POST /api/admin/grant`) that bypass Paystack by creating a `MANUAL-XXXX` order with `amountKobo: 0` and reusing `activateOrderByReference`, and a device sessions view enriched with Clerk email, parsed browser/OS/device type (from `lib/userAgent.ts`, dependency-free UA parsing), IP, and relative "last active"/absolute login timestamps
- User dashboard transaction history is grouped into collapsed-by-default accordion sections — Successful (`status==="success"`), Pending (`status==="pending"`), Failed (everything else, including the server-computed `"expired"` status for lapsed entitlements) — each with a count badge
- Tool images: `products.imageUrl` (nullable) holds a public object-storage URL. Admin panel lets admins upload/replace/remove a product's image (`POST`/`DELETE /api/admin/products/:id/image`). Uploads are analyzed first (`POST .../image/analyze`) for a 512×512 standard aspect ratio; if the image doesn't match, the UI prompts the admin to confirm an auto-resize (never silently distorts or rejects). Server-side processing (`artifacts/api-server/src/lib/toolImages.ts`, using `sharp`) always resizes to a 512×512 canvas with `fit:"contain"` (transparent padding, aspect ratio preserved — never cropped/stretched) and re-encodes as optimized WebP. Storefront (`home.tsx`, `product.tsx`) renders `imageUrl` with `object-contain` in existing fixed-size boxes when present, falling back to the legacy hardcoded logo/icon maps when null, so display size stays consistent site-wide regardless of source image dimensions. Images are served via a minimal `GET /api/storage/public-objects/*` route (`artifacts/api-server/src/routes/storage.ts`), separate from the fuller presigned-upload storage flow in the object-storage skill since resizing must happen server-side before the file ever reaches storage.
- Full tool CRUD lives in the admin panel's "Tools & Pricing" tab, entirely code-free going forward: "Add New Tool" (`POST /api/admin/products`) creates name/short description/category/billing period/1-3-12-month pricing, with image and server credentials added afterward from the new tool's card; each `ToolConfigCard` has an inline details editor (`PUT /api/admin/products/:id` — name/description/fullDescription/category/billingPeriod), a Hide/Unhide toggle (`PUT /api/admin/products/:id/visibility`), and a Delete button behind an AlertDialog confirmation. Visibility (`isHidden`) and soft-delete (`isDeleted`) are two independent boolean flags on `products`: hidden/deleted tools are filtered from the public `/products` list and detail route (404) and blocked from new order creation, but the row itself is preserved (never hard-deleted) so historical orders/entitlements still resolve productId→name correctly. Product's optional `fullDescription` (nullable text, falls back to the required short `description` when absent) is intended for the product detail page.
- **One-Click Auth gating scope**: `oneClickAuthEnabled`/masking only applies to the proxy-redirect path (`server.isAutoLogin === true`). Plain form-submit auto-login (tools with stored credentials but no masking proxy) is never gated by this flag — gating the whole `/tools/:productId/autologin` route would break those tools. Same principle in `/users/me/orders`: credentials fall back to visible (not stranded/null) whenever a tool isn't actively using one-click masking (toggle off, or not an auto-login tool at all).
- **Daily task limits (`maxDailyInputs`)**: optional per-tool cap on subscriber tasks/day, set only via the "Enable Global One-Click Auth" re-auth modal (blank/0 = unlimited). Tracked in `user_daily_usage` (userId/toolId/usageDate/inputCount, unique per day) keyed by a **West African Time (WAT / Africa/Lagos)** calendar-day string so resets happen at Lagos midnight regardless of server/user location (`lib/dailyUsage.ts` — `getWatDateString()`, `checkAndConsumeDailyUsage()`). Enforced in `proxy.ts` as an atomic upsert-with-conditional-increment (`onConflictDoUpdate` + `setWhere`) right before the admin master session is attached, returning HTTP 429 `{"error": "You have reached your daily task limit for this tool."}` once the cap is hit — every request through the proxy (including sub-resource loads) counts as one task, per spec. `/users/me/orders` exposes `maxDailyInputs`/`dailyUsageCount` (WAT-day read-only count) so the dashboard can disable the launch button and show "Tasks remaining today: X / Y (WAT)" once a limit is set.

## Product

Note: product rows live only in the database, not in code — a fresh import starts with an empty `products` table. Re-seed via the admin panel or a direct insert if this ever needs to be repeated.

All 11 subscription products are pre-seeded with tiered pricing (1/3/12 months, `priceKobo`/`price3MonthKobo`/`price12MonthKobo` — the latter two are nullable and checkout only shows durations that have a configured price):
- Grammarly (₦2,500/mo), Quillbot (₦2,500/mo), Phrasly (₦8,500/mo)
- ChatGPT (₦8,500/mo), StealthWriter (₦17,000/mo), NordVPN (₦18,000/mo)
- SEMrush (₦3,000/mo), CapCut (₦5,000/mo), Turnitin (₦2,300/check, 1-month pricing only)
- WriteHuman (₦8,500/mo), Jenni AI (₦7,500/mo)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Fonts `@import url(...)` must be the FIRST line in `index.css` before all other `@import` statements or PostCSS will error silently
- `react-icons/si` v5 does not export `SiOpenai` or `SiCapcut` — use `lucide-react` fallbacks instead
- Project briefly migrated to Monnify (sandbox keys) then reverted to Paystack per user request when live Monnify keys weren't available — Monnify route/schema history is in git if needed again

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
