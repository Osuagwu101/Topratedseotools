import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  status: text("status").notNull().default("pending"),
  // settlement_status tracks post-payment reversals: valid (default), refunded, disputed, reversed, fraudulent
  settlementStatus: text("settlement_status").notNull().default("valid"),
  reference: text("reference").notNull().unique(),
  clerkUserId: text("clerk_user_id"),
  durationMonths: integer("duration_months").notNull().default(1),
  // Breakdown of amountKobo at the time of purchase, for transparency/support and as
  // the integration point for future coupon/discount math (applied to baseAmountKobo
  // before tax/fee). Null on orders created before this breakdown existed.
  baseAmountKobo: integer("base_amount_kobo"),
  taxKobo: integer("tax_kobo"),
  feeKobo: integer("fee_kobo"),
  currency: text("currency"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
