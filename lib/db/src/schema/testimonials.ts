import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testimonialsTable = pgTable("testimonials", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  jobTitle: text("job_title"),
  text: text("text").notNull(),
  rating: integer("rating"),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  isSample: boolean("is_sample").notNull().default(false),
  permissionObtained: boolean("permission_obtained").notNull().default(false),
  // Assignment / purchase linkage for eligibility tracking
  clerkUserId: text("clerk_user_id"),
  orderId: integer("order_id"),
  assignmentId: integer("assignment_id"),
  // manual, purchase, renewal, manual_assignment, complimentary, promotional, admin_correction
  source: text("source").default("manual"),
  // pending, approved, rejected — controls moderation before published is allowed
  approvalStatus: text("approval_status").notNull().default("pending"),
  adminCreated: boolean("admin_created").notNull().default(false),
  requestSent: boolean("request_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTestimonialSchema = createInsertSchema(testimonialsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonialsTable.$inferSelect;
