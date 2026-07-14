import { pgTable, serial, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail for the Product Recovery Centre's one-click
 * actions (reload, restore-missing, rebuild-index, verify, repair-relationships,
 * refresh-cache) — mirrors integrity_audit_log / protected_data_unlock_log.
 */
export const productRecoveryLogTable = pgTable("product_recovery_log", {
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

export type ProductRecoveryLogEntry = typeof productRecoveryLogTable.$inferSelect;
