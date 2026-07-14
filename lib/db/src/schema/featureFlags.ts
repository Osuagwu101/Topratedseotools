import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

// Module-level kill switches for the Feature Management admin page. Single
// row (id=1), same pattern as site_settings. Every flag defaults to "on"
// except guestCheckoutEnabled, which defaults "off" since the checkout flow
// does not yet implement a guest path — the toggle is stored for a future
// feature but has no enforcement point today.
export const featureFlagsTable = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  // Marketplace = browsing the catalog and purchasing tools (catalog page,
  // product detail, checkout/buy flow).
  marketplaceEnabled: boolean("marketplace_enabled").notNull().default(true),
  // AI Tools = launching/using tools a customer already owns (dashboard
  // "Launch" action / the One-Click Auth proxy).
  aiToolsEnabled: boolean("ai_tools_enabled").notNull().default(true),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  loginEnabled: boolean("login_enabled").notNull().default(true),
  // Toggle only — stored and shown in admin, but the checkout flow still
  // requires an authenticated account today. See replit.md / task history.
  guestCheckoutEnabled: boolean("guest_checkout_enabled").notNull().default(false),
  // Global kill switch for the One-Click Auth proxy. When off, it overrides
  // every product's per-tool oneClickAuthEnabled flag.
  oneClickAuthEnabled: boolean("one_click_auth_enabled").notNull().default(true),
  // ── Cache & Maintenance Centre modes ────────────────────────────────────
  // Maintenance Mode: the entire public storefront (everything except
  // /admin) is replaced with a maintenance notice. Used during risky admin
  // work. Enforced both on the frontend (full-screen takeover) and on the
  // backend (new checkout/payment-init requests are rejected) so the mode
  // can't be bypassed by a client that ignores the takeover screen.
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  // Coming Soon Mode: same takeover mechanism as Maintenance Mode, intended
  // for pre-launch. Kept as a separate flag (rather than reusing
  // maintenanceMode) so admins get a distinct, purpose-labeled message and
  // the two states can be reported separately on the System Health/Recovery
  // dashboards.
  comingSoonMode: boolean("coming_soon_mode").notNull().default(false),
  // Read-Only Mode: browsing stays fully open, but new checkouts/payments
  // are rejected server-side. Narrower than Maintenance Mode — see
  // routes/orders.ts and routes/paystack.ts for the enforcement points and
  // the deliberate scope note on why only checkout is gated.
  readOnlyMode: boolean("read_only_mode").notNull().default(false),
  // Optional customer-facing message shown on the Maintenance/Coming Soon
  // takeover screens. Falls back to a generic message on the frontend when null.
  maintenanceMessage: text("maintenance_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
});

export type FeatureFlags = typeof featureFlagsTable.$inferSelect;
