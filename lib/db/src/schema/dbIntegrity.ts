import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail for the Database Integrity Checker — every scan
 * run and every repair attempt (success or failure) gets a row here, mirroring
 * the pattern used by protected_data_unlock_log / config_audit_log.
 */
export const integrityAuditLogTable = pgTable("integrity_audit_log", {
  id: serial("id").primaryKey(),
  // "scan_run" | "repair_applied" | "repair_failed" | "repair_blocked"
  action: text("action").notNull(),
  // Which check this event relates to; null for a scan_run summary event.
  checkKey: text("check_key"),
  summary: jsonb("summary").notNull().default({}),
  staffUserId: integer("staff_user_id"),
  staffEmail: text("staff_email"),
  staffName: text("staff_name"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type IntegrityAuditLogEntry = typeof integrityAuditLogTable.$inferSelect;
