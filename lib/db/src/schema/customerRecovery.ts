import { pgTable, serial, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail for the Customer Recovery Centre's one-click
 * actions (verify users, verify purchases, verify subscriptions, verify
 * downloads, verify entitlements) — mirrors product_recovery_log /
 * payment_recovery_log / integrity_audit_log.
 */
export const customerRecoveryLogTable = pgTable("customer_recovery_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  // "ok" | "blocked" | "partial" | "failed"
  status: text("status").notNull(),
  summary: jsonb("summary").notNull().default({}),
  staffUserId: integer("staff_user_id"),
  staffEmail: text("staff_email"),
  staffName: text("staff_name"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CustomerRecoveryLogEntry = typeof customerRecoveryLogTable.$inferSelect;
