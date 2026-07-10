import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";

// Tracks per-user, per-tool, per-day usage counts for the optional daily
// task cap (products.maxDailyInputs). usageDate is a plain YYYY-MM-DD string
// computed in West African Time (WAT / Africa/Lagos) so the counter resets
// exactly at midnight in Lagos regardless of where the server or user is.
export const userDailyUsageTable = pgTable(
  "user_daily_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    toolId: integer("tool_id").notNull(),
    usageDate: text("usage_date").notNull(),
    inputCount: integer("input_count").notNull().default(0),
  },
  (table) => [unique().on(table.userId, table.toolId, table.usageDate)],
);

export type UserDailyUsage = typeof userDailyUsageTable.$inferSelect;
