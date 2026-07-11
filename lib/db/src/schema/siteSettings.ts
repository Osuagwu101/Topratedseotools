import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  siteLogoUrl: text("site_logo_url"),
  siteHeadline: text("site_headline").notNull().default("Everything You Need to Get More Done with AI"),
  siteSubheadline: text("site_subheadline").notNull().default("Access premium AI tools, manage your subscription with ease, and work smarter—all from one platform."),
  paymentFooterText: text("payment_footer_text").notNull().default("All payments are securely processed with Paystack's end-to-end encryption."),
  copyrightText: text("copyright_text").notNull().default("Top Rated SEO Tools"),
  copyrightYear: text("copyright_year").notNull().default("2025"),
  useDynamicCopyrightYear: boolean("use_dynamic_copyright_year").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
