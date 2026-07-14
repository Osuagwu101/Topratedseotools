import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Append-only registry of backup artifacts. Every backup — manual or
// auto-triggered before a risky operation — gets a row here regardless of
// success/failure, so admins (and later the Restore Manager) always have a
// full history, not just the successful ones.
export const backupsTable = pgTable("backups", {
  id: serial("id").primaryKey(),
  // "full" (DB dump + storage manifest), "database" (DB dump only), or
  // "partial" (a specific dataset scope, e.g. products/orders/users).
  type: text("type").notNull(),
  // Machine key identifying exactly what was backed up, e.g. "full",
  // "database", "products", "orders", "users", "purchases", "settings".
  scope: text("scope").notNull(),
  status: text("status").notNull().default("running"), // running | completed | failed
  sizeBytes: integer("size_bytes"),
  // Key/path into the active object-storage backend where the artifact lives.
  storagePath: text("storage_path"),
  // "manual" (admin clicked Create Backup) or the risky-operation key that
  // auto-triggered this backup, e.g. "bulk_update_products".
  trigger: text("trigger").notNull().default("manual"),
  createdByStaffId: integer("created_by_staff_id"),
  createdByEmail: text("created_by_email"),
  errorMessage: text("error_message"),
  // "development" or "production" — captured at backup time so the Restore
  // Manager can flag (and require extra confirmation for) restoring a
  // backup taken in a different environment than the one it's applied to.
  environment: text("environment").notNull().default("development"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type Backup = typeof backupsTable.$inferSelect;
