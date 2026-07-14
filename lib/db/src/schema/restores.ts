import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

// Append-only history of restore attempts — every request gets a row
// regardless of outcome, mirroring the backups table's append-only design
// so a failed or blocked restore is never silently lost from the audit
// trail shown in the Restore Centre.
export const restoresTable = pgTable("restores", {
  id: serial("id").primaryKey(),
  backupId: integer("backup_id").notNull(),
  // Same key space as backups.scope (e.g. "products", "full").
  scope: text("scope").notNull(),
  status: text("status").notNull().default("running"), // running | completed | failed | blocked
  // Diff computed before applying (added/changed/removed summary, or a
  // coarse table-row-count summary for full/database scope).
  preview: jsonb("preview"),
  // What actually happened once applied (rows written/deleted, files
  // restored, etc.) or the error if it failed.
  result: jsonb("result"),
  errorMessage: text("error_message"),
  // The fresh pre-restore safety backup this restore triggered.
  preRestoreBackupId: integer("pre_restore_backup_id"),
  crossEnvironment: text("cross_environment"), // null, or the backup's origin environment if it differs from the current one
  requestedByStaffId: integer("requested_by_staff_id"),
  requestedByEmail: text("requested_by_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Restore = typeof restoresTable.$inferSelect;
