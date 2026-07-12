---
name: Public product/site-settings API field additions
description: Which store API responses go through Zod-stripping OpenAPI schemas vs plain JSON, and what that means for adding new fields.
---

In `artifacts/store` (SubsHub/Top Rated SEO Tools), most admin and public content endpoints (testimonials, payment-methods, trust settings, new homepage-content resources like benefit-cards/how-it-works-steps/faq-items) are raw Express routes that `res.json()` plain objects — no schema validation on the way out.

The public `/api/products` (`ListProductsResponse`) and product-detail responses are the exception: they run through `api-zod`/`api-client-react` schemas generated from `lib/api-spec/openapi.yaml`, which **strip any field not declared in the OpenAPI schema** even if the DB/route returns it.

**Why:** Discovered when adding `featuredOrder`/`homepageBlurb` columns to `productsTable` for a "Popular Tools" curation feature — the fields were present in the DB and admin route response but silently disappeared from the public `/api/products` payload until the OpenAPI schema was updated and codegen re-run.

**How to apply:** Before adding a new field to anything served by `GET /api/products` (or other zod-parsed public routes), check `lib/api-spec/openapi.yaml` first. If the field isn't in the relevant schema, add it there and run `pnpm run codegen` in `lib/api-spec`, then `pnpm -w run typecheck:libs`. `GET /api/site-settings` is plain JSON (no zod parse) so new site-settings fields don't need this step.
