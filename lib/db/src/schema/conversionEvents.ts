import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const conversionEventsTable = pgTable("conversion_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventName: text("event_name").notNull(),
  reference: text("reference"),
  status: text("status").notNull().default("sending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ConversionEvent = typeof conversionEventsTable.$inferSelect;
