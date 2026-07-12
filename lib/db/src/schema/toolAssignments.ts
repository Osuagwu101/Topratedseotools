import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toolAssignmentsTable = pgTable("tool_assignments", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  productId: integer("product_id").notNull(),
  adminUsername: text("admin_username").notNull(),
  // active, revoked, expired
  status: text("status").notNull().default("active"),
  // purchase, renewal, manual_assignment, complimentary, promotional, admin_correction
  source: text("source").notNull().default("manual_assignment"),
  reason: text("reason"),
  reviewInvitationEnabled: boolean("review_invitation_enabled").notNull().default(true),
  testimonialInvitationEnabled: boolean("testimonial_invitation_enabled").notNull().default(false),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: text("revoked_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertToolAssignmentSchema = createInsertSchema(toolAssignmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  revokedAt: true,
  revokedBy: true,
});
export type InsertToolAssignment = z.infer<typeof insertToolAssignmentSchema>;
export type ToolAssignment = typeof toolAssignmentsTable.$inferSelect;
