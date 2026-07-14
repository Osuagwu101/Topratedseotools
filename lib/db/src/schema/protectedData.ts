import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// Registry of business-critical datasets the Super Admin can lock/unlock.
// `locked` defaults to true — every dataset starts protected, and rows are
// seeded lazily (see protectedData.ts's ensureSeeded) so adding a new
// dataset key to the app-level registry never requires a manual migration
// step to "protect" it retroactively.
export const protectedDatasetsTable = pgTable("protected_datasets", {
  id: serial("id").primaryKey(),
  datasetKey: text("dataset_key").notNull().unique(),
  locked: boolean("locked").notNull().default(true),
  unlockedByStaffId: integer("unlocked_by_staff_id"),
  unlockedByEmail: text("unlocked_by_email"),
  unlockReason: text("unlock_reason"),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  // Unlocks are time-boxed and auto-relock once this passes — see
  // UNLOCK_DURATION_MS in protectedData.ts. Keeps a forgotten "Unlock" from
  // leaving a dataset exposed indefinitely.
  unlockExpiresAt: timestamp("unlock_expires_at", { withTimezone: true }),
  relockedAt: timestamp("relocked_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProtectedDatasetRow = typeof protectedDatasetsTable.$inferSelect;

// Append-only log of every unlock/relock/blocked-attempt event, independent
// of the general config audit log so this centre has its own complete
// history even before the unified Audit Trail Centre (later Phase 3 work)
// exists.
export const protectedDataUnlockLogTable = pgTable("protected_data_unlock_log", {
  id: serial("id").primaryKey(),
  datasetKey: text("dataset_key").notNull(),
  action: text("action").notNull(), // "unlocked" | "relocked" | "auto_relocked" | "blocked_attempt"
  staffUserId: integer("staff_user_id"),
  staffEmail: text("staff_email"),
  staffName: text("staff_name"),
  reason: text("reason"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProtectedDataUnlockLogRow = typeof protectedDataUnlockLogTable.$inferSelect;
