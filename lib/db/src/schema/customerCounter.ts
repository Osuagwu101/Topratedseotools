import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const customerCounterAuditTable = pgTable("customer_counter_audit", {
  id: serial("id").primaryKey(),
  previousTotal: integer("previous_total").notNull(),
  newTotal: integer("new_total").notNull(),
  reason: text("reason").notNull(),
  correctedBy: text("corrected_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CustomerCounterAudit = typeof customerCounterAuditTable.$inferSelect;
