import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// Single-row (id=1) global configuration for the referral programme,
// following the same pattern as feature_flags / payment_settings.
export const referralSettingsTable = pgTable("referral_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: boolean("enabled").notNull().default(true),
  // "percentage" | "fixed" | "store_credit" | "free_product"
  // percentage/fixed/store_credit all deliver the reward as store credit
  // (percentage computes off the qualifying order, the other two use
  // rewardValue directly as a kobo amount). free_product grants a
  // complimentary entitlement to rewardProductId instead.
  rewardType: text("reward_type").notNull().default("percentage"),
  rewardValue: integer("reward_value").notNull().default(10),
  rewardProductId: integer("reward_product_id"),
  minPurchaseKobo: integer("min_purchase_kobo").notNull().default(0),
  campaignStartsAt: timestamp("campaign_starts_at"),
  campaignEndsAt: timestamp("campaign_ends_at"),
  // Caps how many *rewarded* referrals a single referrer can earn. Null = unlimited.
  // Referrals beyond the cap still track as completed for reporting, just without payout.
  maxRewardsPerReferrer: integer("max_rewards_per_referrer"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});

// One unique, auto-generated code per registered user (created lazily on
// first access to their referral dashboard).
export const referralCodesTable = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A referral relationship, created the first time a referred user's order
// carries the referrer's code. A given referee can only ever appear once
// (unique constraint) — this is the primary duplicate-referral guard.
export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerClerkUserId: text("referrer_clerk_user_id").notNull(),
  refereeClerkUserId: text("referee_clerk_user_id").notNull().unique(),
  refereeEmail: text("referee_email"),
  // "pending" (seen, but not yet a qualifying purchase) | "completed" | "rejected" (fraud)
  status: text("status").notNull().default("pending"),
  qualifyingOrderId: integer("qualifying_order_id"),
  rewardType: text("reward_type"),
  rewardKobo: integer("reward_kobo"),
  rewardGranted: boolean("reward_granted").notNull().default(false),
  // Why a referral was rejected or a reward wasn't granted, for admin visibility.
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Per-user store credit balance, spendable at checkout. Kept separate from
// orders so it isn't tied to any one product/purchase.
export const userCreditsTable = pgTable("user_credits", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  balanceKobo: integer("balance_kobo").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Full audit trail of every credit/debit against a user's balance.
export const creditTransactionsTable = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  // Positive = credit (reward), negative = debit (spent at checkout).
  amountKobo: integer("amount_kobo").notNull(),
  reason: text("reason").notNull(),
  referralId: integer("referral_id"),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReferralSettings = typeof referralSettingsTable.$inferSelect;
export type ReferralCode = typeof referralCodesTable.$inferSelect;
export type Referral = typeof referralsTable.$inferSelect;
export type UserCredit = typeof userCreditsTable.$inferSelect;
export type CreditTransaction = typeof creditTransactionsTable.$inferSelect;
