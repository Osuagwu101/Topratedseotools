import { pgTable, serial, boolean, text, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";

// Single-row table (id=1), same convention as siteSettingsTable/analyticsSettingsTable.
// Governs Paystack-facing commercial parameters + gateway on/off + test/live mode.
// Secret API keys themselves live in the System Configuration Centre's encrypted
// vault (systemConfig.ts) — this table only holds non-secret operational settings.
export const paymentSettingsTable = pgTable("payment_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  testMode: boolean("test_mode").notNull().default(false),
  currency: text("currency").notNull().default("NGN"),
  // Percentages, e.g. 7.5 means 7.5%.
  taxPercent: doublePrecision("tax_percent").notNull().default(0),
  feePercent: doublePrecision("fee_percent").notNull().default(0),
  feeFlatKobo: integer("fee_flat_kobo").notNull().default(0),
  minPurchaseKobo: integer("min_purchase_kobo").notNull().default(0),
  // Null means "no maximum".
  maxPurchaseKobo: integer("max_purchase_kobo"),
  // Updated by the Paystack webhook handler on every signature-verified delivery,
  // regardless of event type — used purely as a "webhooks are reaching us" signal
  // for the Verify Webhooks diagnostic.
  lastWebhookReceivedAt: timestamp("last_webhook_received_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedByEmail: text("updated_by_email"),
});

export type PaymentSettings = typeof paymentSettingsTable.$inferSelect;
