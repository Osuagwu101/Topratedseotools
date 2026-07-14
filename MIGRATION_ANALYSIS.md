# TopRatedSEOTools — Architecture Analysis & VPS Migration Plan

**Status:** Analysis only. No refactoring, redesign, or functionality changes have been made. Codebase imported as-is from GitHub (`Osuagwu101/Topratedseotools`, branch `main`) onto branch `import/topratedseotools`. The prior template scaffold is preserved untouched on `backup-pre-import` and `main`.

## 1. What this app is

A subscription-based **SaaS tool reseller**: customers pay (via Paystack) for time-limited access to shared accounts on third-party AI/productivity tools (ChatGPT, Grammarly, QuillBot, NordVPN, etc. — see `artifacts/store/public/logos/`). After payment, the backend proxies the user's browser session into a shared upstream account, rewriting HTML/CSS/JS on the fly so the tool appears to run under the app's own domain. It also runs an AI-assisted SEO/blog content system for organic marketing.

## 2. Architecture

Monorepo (pnpm workspaces), 3 artifacts:

| Artifact | Kind | Stack | Role |
|---|---|---|---|
| `artifacts/store` | web (React + Vite) | Wouter routing, Radix/shadcn UI, TipTap editor, Clerk React | Storefront, checkout, blog, admin UI, customer dashboard |
| `artifacts/api-server` | api (Express 5) | Drizzle ORM, Clerk Express, Pino logging | REST API, Paystack integration, AI SEO generation, tool proxy, object storage |
| `lib/db` | shared package | Drizzle ORM + `pg.Pool` | Single source of truth for the Postgres schema, imported by the API server |

Single Postgres database (`DATABASE_URL`), no ORM migration files checked into the repo — schema changes are pushed via `drizzle-kit push` directly against the live DB (no versioned migration history).

## 3. Database schema (`lib/db/src/schema/`)

| Table | Purpose |
|---|---|
| `products` | Storefront items — price (kobo), billing period, features, soft-delete flag |
| `orders` | Transactions — customer email, unique `reference`, status, settlement status |
| `order_attributions` | UTM/click-id (`fbclid`, `gclid`, `fbp`, `fbc`) captured per order for ad attribution |
| `payment_methods` | Payment method metadata shown at checkout |
| `tool_entitlements` | Grants access: `clerkUserId` + `productId` + expiry, unique on `reference`/`order_id` |
| `tool_servers` | Shared upstream tool accounts — **stores plaintext username/password** |
| `tool_assignments` | Which user is routed to which shared tool server |
| `user_daily_usage` | Per-user/day usage counters (rate limiting), unique on `(userId, toolId, usageDate)` |
| `user_device_sessions` | Device/IP/session tracking for fraud & seat control |
| `staff_users` / staff sessions | CMS/staff accounts (administrator, editor, author roles), `scryptSync` password hashing |
| `blog_*` | Full blog CMS: posts, categories, tags, redirects, comments |
| `seo_generator_*` | AI content pipeline: briefs, generated versions, quality reports |
| `site_settings`, `analytics_settings`, `homepage_content` | Singleton-style (id=1) DB-backed site configuration |
| `customer_counter`, `conversion_events` | Marketing/social-proof counters and conversion tracking |
| `reviews`, `testimonials` | Social proof content |

**Schema risk flags:**
- No `.references()` foreign-key constraints defined in Drizzle (e.g. `orders.productId` is a plain integer) — referential integrity is enforced only by application code, not the database. Orphaned rows are possible on deletes.
- No explicit indexes on hot lookup columns (`clerkUserId`, `productId` in `orders`/`tool_entitlements`) beyond the unique constraints that already exist.
- `tool_servers.username`/`password` stored in **plaintext** — a DB dump or backup leak exposes live credentials to paid third-party tools.
- No migrations directory — schema evolves via direct `push`, which is destructive-by-default if a column is dropped/renamed without a manual guard.

## 4. Authentication

- **Customers:** Clerk (`@clerk/react` frontend, `@clerk/express` backend). No guest checkout — all order activation and tool access requires a `clerkUserId`.
- **Staff/CMS:** Separate `staff_users` table with roles, session cookie, `scryptSync` hashing — used for the blog CMS at `/blog-staff-login`.
- **Legacy admin panel (`/admin`):** Gated purely by HTTP Basic Auth against `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars — not tied to any user record, no audit trail, no MFA. If unset, admin routes return 503.
- Logging in via the legacy admin auto-provisions a "Site Owner" staff account for the CMS, blending the two auth systems.
- `ADMIN_SECRET` (found hardcoded in `.replit` as `userenv.shared.ADMIN_SECRET = "subshub-admin-2026"`) is **not referenced anywhere in the application code** — it appears to be an orphaned/unused variable, not the actual gate. The real gate is `ADMIN_USERNAME`/`ADMIN_PASSWORD`. Worth removing or clarifying since it looks load-bearing but isn't.

## 5. Payments & subscriptions

- **Provider:** Paystack only (no Stripe/PayPal). Server-side key: `PAYSTACK_SECRET_KEY` (falls back to `PAYSTACK_API_KEY`).
- **Flow:** `POST /orders` (status `pending`, unique `SUB-` reference) → `POST /paystack/initialize` → redirect to Paystack → `/success` → `/paystack/verify/:reference` (also mirrored by a signed webhook) → `activateOrderByReference` marks the order `success` and inserts a `tool_entitlements` row with an expiry based on `duration_months`.
- **Idempotency:** Both the webhook and client-triggered verification share `activateOrderByReference`, and entitlement insert uses `onConflictDoNothing` — replay-safe.
- **No recurring billing** — every purchase is a fixed-term grant (1/3/12 months); renewal is a fresh manual purchase, not a subscription object.
- **Attribution:** UTM/ad click IDs are attached to orders client-side and a server-side Meta Conversions API `Purchase` event fires on activation (works even if the client tab closes).
- **Risk:** underpaid transactions are marked `failed` with no entitlement (correct), but there's no row-level lock during activation — mitigated only by the unique constraint/`onConflictDoNothing`, not a transaction-level guarantee.

## 6. AI integrations

- **OpenAI** (`gpt-4o-mini`) and **Google Gemini** (`gemini-flash-latest`) both used for the SEO/blog content generator, with automatic fallback from one to the other on rate-limit/quota errors (`artifacts/api-server/src/lib/seoGenerator/aiClient.ts`).
- Keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`.
- No other AI providers in use.

## 7. Admin dashboard & the tool-proxy mechanism

The `/admin` dashboard manages products, orders, tool servers/assignments, site settings, homepage content, blog, and reviews. The core differentiator is the **tool proxy**:

1. Customer buys access → gets a `tool_entitlement`.
2. Backend assigns them to a shared `tool_server` account.
3. All requests to `/api/proxy/:productId/*` are forwarded to the real tool's domain using the shared account's session, with response HTML/CSS/JS rewritten so URLs point back at this app's own domain.
4. `user_daily_usage` enforces per-user daily limits, keyed to West African Time.

This is inherently fragile to the upstream tools' own anti-abuse/session mechanics, and because the shared session cookie is injected into every proxied request, a proxy-layer compromise would expose all shared accounts at once.

## 8. "Downloads" 

There is no downloadable-software/file-delivery feature — access is exclusively via the live tool proxy above. Object storage (Google Cloud Storage, via `@google-cloud/storage` + Replit's managed bucket, `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS`) is used for blog images and generated SEO content assets, not customer downloads.

## 9. Configuration architecture — env-var vs DB-backed, and Super Admin recommendations

Already DB-backed today (good — survives redeploys naturally): site headline/branding, WhatsApp config, SEO metadata, homepage FAQs/benefit cards, blog settings, products, reviews/testimonials.

**Env-var-only settings that function as global config and should move into the DB-backed Super Admin settings system**, so they survive redeploys/migrations without redeploy-time coordination and so non-technical staff can change them without touching the server environment:

- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — should become real staff accounts (the `staff_users` table already exists and is more auditable) rather than a single shared Basic Auth credential.
- `META_PIXEL_ID`, `GOOGLE_TAG_MANAGER_ID`, `META_CONVERSIONS_API_TOKEN`, `META_TEST_EVENT_CODE` — currently a DB/env hybrid (DB value wins, env is fallback); the env fallback path should be removed once DB values are always set, to avoid two sources of truth silently drifting.
- `SITE_URL` — used for canonical links and CAPI; belongs with the other DB-backed site settings.
- `PAYSTACK_SECRET_KEY`/`PAYSTACK_API_KEY` — these should stay as server-side secrets (never move to a DB config UI), but should be surfaced in a Super Admin "integrations" screen for visibility/rotation, not silently baked into the hosting environment only.
- Currency list in `artifacts/store/src/context/currency.tsx` is hardcoded in frontend source rather than DB-driven — should move into `site_settings` if new currencies are ever expected.

**Must remain true secrets (never expose in a UI, never commit to git):** `PAYSTACK_SECRET_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `SESSION_SECRET`, GCS/object-storage credentials.

## 10. Full environment variable / secret / integration catalog

| Variable | Used by | Nature |
|---|---|---|
| `DATABASE_URL` | `lib/db` | Secret — Postgres connection string |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | `api-server` admin routes | Secret-ish shared credential (see §9 recommendation) |
| `ADMIN_SECRET` | none (orphaned, only in `.replit`) | Unused — remove or repurpose |
| `CLERK_SECRET_KEY` | `api-server` | Secret |
| `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | `api-server` + `store` frontend | Public key |
| `VITE_CLERK_PROXY_URL` | `store` frontend | Config |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_API_KEY` | `api-server` | Secret |
| `OPENAI_API_KEY` | `api-server` (SEO generator) | Secret |
| `GEMINI_API_KEY` | `api-server` (SEO generator) | Secret |
| `META_PIXEL_ID` / `VITE_META_PIXEL_ID` | analytics | Config (DB-preferred) |
| `GOOGLE_TAG_MANAGER_ID` / `VITE_GTM_ID` | analytics | Config (DB-preferred) |
| `META_CONVERSIONS_API_TOKEN` | server-side Meta CAPI | Secret |
| `META_TEST_EVENT_CODE` | Meta CAPI test mode | Config |
| `SESSION_SECRET` | session/cookie signing | Secret — **has a hardcoded fallback string in `analyticsSettings.ts`; must always be set explicitly in every environment** |
| `SITE_URL` | canonical links / CAPI | Config |
| `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | object storage paths | Config, currently Replit-managed GCS bucket (`objectStorage.defaultBucketID` in `.replit`) |
| `PORT`, `BASE_PATH`, `NODE_ENV`, `LOG_LEVEL` | runtime/infra | Non-secret config |
| `REPL_ID` and other `REPL_*` | Replit-environment-only (object storage/connectors) | **Will not exist on a VPS — must be replaced (see §12)** |

No `.env` file is tracked in git (good), but `.gitignore` also has no explicit `.env` rule — if anyone creates one at the repo root it could be committed by accident. Worth adding `.env*` to `.gitignore` as a safety net (not a functional change, purely defensive — flagging for your decision, not applying it yet since you asked for analysis-only).

**Third-party integrations in use:** Clerk (auth), Paystack (payments), OpenAI + Google Gemini (AI content), Meta Pixel/Conversions API + Google Tag Manager (analytics/ads), Google Cloud Storage (object storage, currently via Replit's managed bucket).

## 11. Data-loss risk flags

These are the specific ways products/users/orders/entitlements/settings could be lost across the operations you asked about:

1. **Schema drift via `drizzle-kit push` with no migration history.** Any future `push` against production is not reviewable/diffable against a migration log — a column rename or drop is one command away from silent data loss, and there is no way to replay history to recover.
2. **No DB-level foreign keys.** Deleting a `product` or `staff_user` can silently orphan `orders`, `tool_entitlements`, `tool_assignments` rows rather than being blocked or cascaded intentionally.
3. **Object storage bucket is Replit-managed** (`objectStorage.defaultBucketID` in `.replit`). If this app is migrated off Replit without first exporting bucket contents and re-pointing `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS` at a self-owned GCS/S3 bucket, all blog images and generated content assets are lost on cutover.
4. **`REPL_ID`/Replit-only env vars baked into runtime assumptions.** Anything relying on Replit's connector/object-storage SDK auto-detecting `REPL_ID` will silently fail (not error loudly) off-platform unless explicitly replaced during migration — this is exactly the kind of "silent fallback" failure to guard against.
5. **`ADMIN_SECRET` sitting in `.replit` (a file that is version-controlled) as plaintext** — anyone with read access to the repo (including in a public fork or a leaked git export) sees this value. It's currently unused, but if it's ever wired up as a real credential later, that fact will already be public in git history.
6. **Plaintext `tool_servers` credentials in the database.** A routine DB backup/export handed to a new host or contractor exposes live third-party account passwords with no extra step.
7. **`SESSION_SECRET` hardcoded fallback.** If the env var is ever missing in a new environment (e.g. a rushed VPS cutover), the app will start anyway using the fallback in `analyticsSettings.ts` instead of failing loudly — this silently weakens session security rather than blocking a bad deploy.
8. **No versioned DB migrations = no repeatable disaster recovery.** If the production DB is lost or corrupted, there's no scripted way to rebuild the schema from git history; you'd have to reconstruct it from the current live DB via `drizzle-kit pull`/introspection, which will not recover data, only structure.
9. **Git-side risk:** the repo currently has no `.env*` git-ignore rule and no CI check preventing a secret from being committed by accident in a future commit — a one-time defensive addition (not applied yet, per your analysis-only instruction).

## 12. VPS (Hostinger-style) production-readiness migration plan

Goal: move off Replit to a self-managed VPS while preserving every feature and the existing UI exactly as-is — no redesign, no functionality removal.

### 12.1 Target stack on the VPS
- Node.js 20.x runtime (matches `modules = ["nodejs-20", ...]` in `.replit`) via a version manager (`nvm`) or system package.
- PostgreSQL 16 (matches `postgresql-16` in `.replit`) — either self-hosted on the VPS or a managed provider (Neon/Supabase/RDS) reachable via `DATABASE_URL`.
- pnpm (the repo's package manager) installed globally.
- A process manager (`pm2` or `systemd` unit) to run the built API server (`artifacts/api-server/dist/index.mjs`) and keep it alive across crashes/reboots.
- Nginx (or Caddy) as reverse proxy/TLS terminator in front of: static build of `artifacts/store` (served as static files, matching the existing `services.production.publicDir`/rewrite config in `artifact.toml`) and the API server on its own port, routed under `/api` — mirroring the current path-based routing (`/`, `/api`) so no frontend code changes are needed.

### 12.2 Environment/config parity
- Recreate every secret in §10 in the VPS's own secret store (systemd `EnvironmentFile`, or a `.env` loaded server-side only, never committed) — Clerk keys, Paystack keys, OpenAI/Gemini keys, `SESSION_SECRET` (explicitly, don't rely on the fallback), Meta CAPI token, `DATABASE_URL`.
- Replace Replit-specific object storage with a self-owned Google Cloud Storage bucket (the code already uses the standard `@google-cloud/storage` SDK, so this is a credentials/bucket-name swap, not a code rewrite) — export the current bucket's contents first and re-upload to the new bucket before cutover so no blog/SEO images are lost.
- Drop the `REPL_ID`/`REPLIT_CONNECTORS_HOSTNAME`-dependent code paths in favor of directly configured GCS service-account credentials.

### 12.3 Data migration (zero data loss)
1. `pg_dump` the current production database in full (schema + data) before any cutover.
2. Provision the new Postgres instance, restore the dump verbatim (`pg_restore`/`psql`) — this preserves every product, order, entitlement, subscription-period, and setting row exactly.
3. Run `drizzle-kit generate` once against the restored DB to snapshot a baseline migration file into git going forward, so future schema changes are reviewable diffs instead of blind `push`es (recommended before, not during, the move — flagged here as a follow-up, not applied now per your instruction).
4. Copy the GCS bucket contents (see 12.2) before switching `PRIVATE_OBJECT_DIR`/`PUBLIC_OBJECT_SEARCH_PATHS`.
5. Keep the Replit deployment live and read-only-diverted (or simply paused) until the VPS has been smoke-tested against a copy of the data, then do a short-downtime final `pg_dump`/restore delta and DNS cutover.

### 12.4 Build & deploy steps on the VPS
1. `git clone` the repo (this exact codebase, unmodified).
2. `pnpm install --frozen-lockfile`.
3. Build frontend: `pnpm --filter @workspace/store run build` → serve `artifacts/store/dist/public` as static files via Nginx, with an SPA fallback rewrite `/* → /index.html` (mirrors the existing `artifact.toml` production rewrite rule, so client-side routing keeps working identically).
4. Build backend: `pnpm --filter @workspace/api-server run build` → run `node --enable-source-maps artifacts/api-server/dist/index.mjs` under pm2/systemd, `PORT` set to whatever internal port Nginx proxies `/api` to.
5. Point Nginx: `/` → static store build, `/api` → API server port — preserving the current path-based routing so no frontend URLs change.
6. Set up TLS (Let's Encrypt via Certbot) on the domain.
7. Point the domain's DNS at the new VPS, cut over.

### 12.5 Ongoing operational gaps to close post-migration (flagged, not yet actioned)
- Add versioned Drizzle migrations (see 12.3.3) so future schema changes are reviewable and reversible.
- Add DB-level foreign keys where the schema currently only implies relationships in code.
- Move `ADMIN_USERNAME`/`ADMIN_PASSWORD` Basic Auth to real `staff_users` accounts for auditability.
- Encrypt `tool_servers.username`/`password` at rest, or move them to a secrets manager instead of a plain DB column.
- Add automated, off-VPS database backups (the single biggest data-loss risk on a self-managed VPS is not having offsite backups — Replit's managed environment does this implicitly today; a VPS does not, unless configured).

---

*Everything above is analysis and documentation only. No application code, schema, or configuration has been modified. The imported codebase lives on branch `import/topratedseotools`; the previous template scaffold is untouched on `main`/`backup-pre-import`.*
