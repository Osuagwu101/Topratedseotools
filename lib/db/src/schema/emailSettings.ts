import { pgTable, serial, boolean, text, timestamp } from "drizzle-orm/pg-core";

// Single-row table (id=1), same convention as payment_settings/site_settings.
// Governs Resend-facing sender identity + on/off + last-test-send bookkeeping
// for the Email Configuration Centre. The RESEND_API_KEY secret itself lives
// in the System Configuration Centre's encrypted vault (systemConfig.ts) --
// this table only holds non-secret operational settings.
export const emailSettingsTable = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  // When off, sendTestEmail()/any future transactional send is blocked even
  // if a RESEND_API_KEY is configured -- an explicit admin opt-in.
  enabled: boolean("enabled").notNull().default(false),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  // Null means replies go to senderEmail (Resend's own default behavior).
  replyToEmail: text("reply_to_email"),
  lastTestSentAt: timestamp("last_test_sent_at", { withTimezone: true }),
  lastTestSentToEmail: text("last_test_sent_to_email"),
  lastTestResultOk: boolean("last_test_result_ok"),
  lastTestResultMessage: text("last_test_result_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedByEmail: text("updated_by_email"),
});

export type EmailSettings = typeof emailSettingsTable.$inferSelect;
