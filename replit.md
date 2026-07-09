# SubsHub

A subscription services storefront where users can browse and purchase monthly access to popular productivity and AI tools. Payments are processed via Monnify.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `MONNIFY_API_KEY` — Monnify API key
- Required env: `MONNIFY_SECRET_KEY` — Monnify secret key
- Required env: `MONNIFY_CONTRACT_CODE` — Monnify contract code

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Payments: Monnify

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (products, orders)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/store/src/pages/` — React pages (home, product, checkout, success)
- `artifacts/store/src/components/` — Shared UI components

## Architecture decisions

- Monnify payment flow: create order → initialize payment (server builds checkout with DB-sourced amount) → redirect to Monnify checkout → redirectUrl sends customer back to `/success?reference=...` → verify on return
- Verify route re-checks the amount actually paid against the order's `amountKobo`; underpayment marks the order `failed` instead of `success`
- Prices stored in kobo (1 NGN = 100 kobo); displayed divided by 100 in the frontend; Monnify's API expects amounts in naira, so the server divides by 100 when calling Monnify and multiplies verified amounts back to kobo
- `billingPeriod` is either "monthly" or "per_check" (Turnitin)
- Orders get a unique `reference` (SUB-XXXX) at creation time, used as Monnify's `paymentReference` for matching

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
- Monnify `MONNIFY_API_KEY`/`MONNIFY_SECRET_KEY`/`MONNIFY_CONTRACT_CODE` must all be set or payment initialization will fail
- Monnify access tokens are cached in-memory per server instance and refreshed automatically before expiry

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
