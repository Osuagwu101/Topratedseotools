import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// "Why Choose Us" benefit cards on the homepage.
export const benefitCardsTable = pgTable("benefit_cards", {
  id: serial("id").primaryKey(),
  icon: text("icon").notNull().default("ShieldCheck"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBenefitCardSchema = createInsertSchema(benefitCardsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBenefitCard = z.infer<typeof insertBenefitCardSchema>;
export type BenefitCard = typeof benefitCardsTable.$inferSelect;

// "How It Works" steps on the homepage.
export const howItWorksStepsTable = pgTable("how_it_works_steps", {
  id: serial("id").primaryKey(),
  icon: text("icon").notNull().default("MousePointerClick"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHowItWorksStepSchema = createInsertSchema(howItWorksStepsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHowItWorksStep = z.infer<typeof insertHowItWorksStepSchema>;
export type HowItWorksStep = typeof howItWorksStepsTable.$inferSelect;

// FAQ accordion entries, reused on the homepage (and could later be reused on /support).
export const faqItemsTable = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFaqItemSchema = createInsertSchema(faqItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFaqItem = z.infer<typeof insertFaqItemSchema>;
export type FaqItem = typeof faqItemsTable.$inferSelect;
