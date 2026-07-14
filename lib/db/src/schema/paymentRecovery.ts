import { pgTable, serial, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail for the Payment Recovery Centre's one-click
 * actions (verify gateway, repair payment configuration, verify webhooks,
 * verify transaction records, reload payment services, reconnect gateway)
 * — mirrors product_recovery_log / integrity_audit_log.
 */
export const paymentRecoveryLogTable = pgTable("payment_recovery_log", {
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

export type PaymentRecoveryLogEntry = typeof paymentRecoveryLogTable.$inferSelect;
