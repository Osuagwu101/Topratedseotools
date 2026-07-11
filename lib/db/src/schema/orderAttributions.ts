import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const orderAttributionsTable = pgTable("order_attributions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
  fbclid: text("fbclid"),
  gclid: text("gclid"),
  fbp: text("fbp"),
  fbc: text("fbc"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OrderAttribution = typeof orderAttributionsTable.$inferSelect;
