import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A coupon discounts an order's base amount (pre-tax/fee) at checkout. Scope
// and eligibility rules are all enforced server-side in lib/coupons.ts —
// nothing here is trusted from the client beyond the code string itself.
export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  // Always stored/matched upper-cased so "save10" and "SAVE10" are the same code.
  code: text("code").notNull().unique(),
  description: text("description"),
  // "percentage" | "fixed"
  discountType: text("discount_type").notNull().default("percentage"),
  // Percentage points (0-100) when discountType is "percentage", kobo amount when "fixed".
  discountValue: integer("discount_value").notNull(),
  // "all" | "selected"
  scope: text("scope").notNull().default("all"),
  productIds: integer("product_ids").array().notNull().default([]),
  minPurchaseKobo: integer("min_purchase_kobo").notNull().default(0),
  // Caps the computed discount for percentage coupons. Null = uncapped.
  maxDiscountKobo: integer("max_discount_kobo"),
  // Null = unlimited.
  usageLimitTotal: integer("usage_limit_total"),
  usageLimitPerCustomer: integer("usage_limit_per_customer"),
  // Incremented only when a redemption is finalized (order paid successfully),
  // not at order-creation time, so abandoned/unpaid orders don't burn usage.
  usedCount: integer("used_count").notNull().default(0),
  requiresLogin: boolean("requires_login").notNull().default(false),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

// One row per finalized (paid) redemption — the source of truth for
// analytics and per-customer usage limits.
export const couponRedemptionsTable = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull(),
  // Unique so a retried/duplicate activation call for the same order can never
  // double-redeem a coupon — see recordCouponRedemption in lib/coupons.ts.
  orderId: integer("order_id").notNull().unique(),
  customerEmail: text("customer_email").notNull(),
  clerkUserId: text("clerk_user_id"),
  discountKobo: integer("discount_kobo").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usedCount: true,
});
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
export type CouponRedemption = typeof couponRedemptionsTable.$inferSelect;
