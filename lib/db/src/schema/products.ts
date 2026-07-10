import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  fullDescription: text("full_description"),
  imageUrl: text("image_url"),
  priceKobo: integer("price_kobo").notNull(),
  price3MonthKobo: integer("price_3_month_kobo"),
  price12MonthKobo: integer("price_12_month_kobo"),
  billingPeriod: text("billing_period").notNull(),
  category: text("category").notNull(),
  features: text("features").array().notNull().default([]),
  popular: boolean("popular").notNull().default(false),
  // Hidden tools are excluded from the public storefront and cannot be
  // purchased, but existing subscribers keep access until expiry.
  isHidden: boolean("is_hidden").notNull().default(false),
  // Soft-delete flag: deleted tools are excluded everywhere in the public
  // and admin-management UI, but the row is kept so historical orders can
  // still resolve productId -> name/price for reporting/auditing.
  isDeleted: boolean("is_deleted").notNull().default(false),
  // Global "One-Click Auth" toggle: when true, subscribers see a one-click
  // login button that routes through the server-side proxy using the admin's
  // captured master session for this tool (see tool_servers.isAutoLogin).
  // Can only be turned on via the admin re-authentication flow, which
  // captures a fresh master session at the same time.
  oneClickAuthEnabled: boolean("one_click_auth_enabled").notNull().default(false),
  // Optional daily task cap enforced by the masking proxy while One-Click Auth
  // is on. Null/0 means unlimited. Reset tracking lives in user_daily_usage,
  // keyed by West African Time (WAT) calendar day.
  maxDailyInputs: integer("max_daily_inputs"),
  // Recommendation config, configured per-product in the admin panel and
  // rendered on the storefront's product detail page: cross-sell (complementary
  // tools), up-sell (higher-tier/premium alternative), down-sell (cheaper
  // alternative). Each is a list of other product ids; nullable/empty means
  // "not configured" and the corresponding section is hidden.
  crossSellProductIds: integer("cross_sell_product_ids").array().notNull().default([]),
  upSellProductIds: integer("up_sell_product_ids").array().notNull().default([]),
  downSellProductIds: integer("down_sell_product_ids").array().notNull().default([]),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
