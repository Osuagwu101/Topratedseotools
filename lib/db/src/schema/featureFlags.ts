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
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
});

export type FeatureFlags = typeof featureFlagsTable.$inferSelect;
