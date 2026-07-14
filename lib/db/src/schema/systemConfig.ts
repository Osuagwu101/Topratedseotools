import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

// Encrypted, admin-managed override store for API credentials/config values
// (Paystack, Clerk, OpenAI, Gemini, Resend, Session Secret, Encryption Key,
// etc). `valueEncrypted` holds AES-256-GCM ciphertext produced by
// `secretsVault.ts` — plaintext secrets are never written to this table. A
// null/missing row for a given key means "no override configured yet"; the
// app falls back to the corresponding environment variable in that case.
export const systemConfigTable = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  valueEncrypted: text("value_encrypted"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedByStaffId: integer("updated_by_staff_id"),
  updatedByEmail: text("updated_by_email"),
});

export type SystemConfigRow = typeof systemConfigTable.$inferSelect;

// Append-only audit trail for every System Configuration Centre action.
// Never stores secret values — only who did what to which credential, and
// when. `detail` is a short human-readable description (e.g. "Updated
// Paystack Secret Key").
export const configAuditLogTable = pgTable("config_audit_log", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull(),
  action: text("action").notNull(), // "created" | "updated" | "cleared" | "test_connection" | "bootstrap"
  staffUserId: integer("staff_user_id"),
  staffEmail: text("staff_email"),
  staffName: text("staff_name"),
  detail: text("detail"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConfigAuditLogRow = typeof configAuditLogTable.$inferSelect;
