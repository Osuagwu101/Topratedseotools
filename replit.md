# SubsHub

A subscription services storefront where users can browse and purchase monthly access to popular productivity and AI tools. Payments are processed via Paystack.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `PAYSTACK_SECRET_KEY` — Paystack secret key (falls back to `PAYSTACK_API_KEY` if unset)

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
- Verify route re-checks the amount actually paid against the order's `amountKobo`; underpayment marks the order `failed`/`underpaid` instead of `success`
- Prices stored in kobo (1 NGN = 100 kobo) throughout, matching Paystack's API (which also expects/returns amounts in kobo) — no unit conversion needed for Paystack, unlike the brief Monnify migration
- `billingPeriod` is either "monthly" or "per_check" (Turnitin)
- Orders get a unique `reference` (SUB-XXXX) at creation time, used as Paystack's `reference` for matching

## Product

All 9 subscription products are pre-seeded:
- Grammarly (₦2,500/mo), Quillbot (₦2,500/mo), Phrasly (₦8,500/mo)
- ChatGPT (₦8,500/mo), StealthWriter (₦17,000/mo), NordVPN (₦18,000/mo)
- SEMrush (₦3,000/mo), CapCut (₦5,000/mo), Turnitin (₦2,300/check)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Fonts `@import url(...)` must be the FIRST line in `index.css` before all other `@import` statements or PostCSS will error silently
- `react-icons/si` v5 does not export `SiOpenai` or `SiCapcut` — use `lucide-react` fallbacks instead
- Project briefly migrated to Monnify (sandbox keys) then reverted to Paystack per user request when live Monnify keys weren't available — Monnify route/schema history is in git if needed again

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
