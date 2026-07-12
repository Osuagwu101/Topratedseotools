import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const toolEntitlementsTable = pgTable("tool_entitlements", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  productId: integer("product_id").notNull(),
  serverId: integer("server_id"),
  orderId: integer("order_id").unique(),
  assignmentId: integer("assignment_id"),
  reference: text("reference").notNull().unique(),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ToolEntitlement = typeof toolEntitlementsTable.$inferSelect;
