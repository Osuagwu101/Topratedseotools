import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  rating: integer("rating").notNull(),
  title: text("title"),
  text: text("text").notNull(),
  // pending, approved, rejected, hidden
  status: text("status").notNull().default("pending"),
  verified: boolean("verified").notNull().default(false),
  adminReply: text("admin_reply"),
  adminReplyAt: timestamp("admin_reply_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const reviewPromptsTable = pgTable(
  "review_prompts",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    orderId: integer("order_id").notNull(),
    productId: integer("product_id").notNull(),
    promptCount: integer("prompt_count").notNull().default(0),
    lastPromptedAt: timestamp("last_prompted_at"),
    reviewedAt: timestamp("reviewed_at"),
    dismissedAt: timestamp("dismissed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("review_prompts_user_order_product_idx").on(table.clerkUserId, table.orderId, table.productId)],
);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true, createdAt: true, updatedAt: true, verified: true, status: true, adminReply: true, adminReplyAt: true });
export const insertReviewPromptSchema = createInsertSchema(reviewPromptsTable).omit({ id: true, createdAt: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;
export type ReviewPrompt = typeof reviewPromptsTable.$inferSelect;
