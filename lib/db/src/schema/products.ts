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
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
