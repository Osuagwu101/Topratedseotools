import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const userDeviceSessionsTable = pgTable("user_device_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  deviceId: text("device_id").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});
