import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  priceKobo: integer("price_kobo").notNull(),
  price3MonthKobo: integer("price_3_month_kobo"),
  price12MonthKobo: integer("price_12_month_kobo"),
  billingPeriod: text("billing_period").notNull(),
  category: text("category").notNull(),
  features: text("features").array().notNull().default([]),
  popular: boolean("popular").notNull().default(false),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
