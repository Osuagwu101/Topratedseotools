import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  siteLogoUrl: text("site_logo_url"),
  siteHeadline: text("site_headline").notNull().default("Everything You Need to Get More Done with AI"),
  siteSubheadline: text("site_subheadline").notNull().default("Access premium AI tools, manage your subscription with ease, and work smarter—all from one platform."),
  paymentFooterText: text("payment_footer_text").notNull().default("All payments are securely processed with Paystack's end-to-end encryption."),
  copyrightText: text("copyright_text").notNull().default("Top Rated SEO Tools"),
  copyrightYear: text("copyright_year").notNull().default("2025"),
  useDynamicCopyrightYear: boolean("use_dynamic_copyright_year").notNull().default(true),
  // Trust & support
  businessEmail: text("business_email"),
  businessEmailPublic: boolean("business_email_public").notNull().default(false),
  businessEmailClickable: boolean("business_email_clickable").notNull().default(true),
  whatsappNumber: text("whatsapp_number"),
  whatsappMessage: text("whatsapp_message").default("Hello, I need assistance with a product or subscription on Top Rated SEO Tools."),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  paymentIconsEnabled: boolean("payment_icons_enabled").notNull().default(true),
  // Support page
  supportPageMessage: text("support_page_message").default("For the fastest response, please reach out to us on WhatsApp. We typically reply within minutes."),
  // Testimonials
  testimonialsEnabled: boolean("testimonials_enabled").notNull().default(true),
  // Customers served counter
  customersServedBaseline: integer("customers_served_baseline").notNull().default(100),
  customersServedCountingMethod: text("customers_served_counting_method").notNull().default("unique_customers"),
  customersServedManualCorrection: integer("customers_served_manual_correction").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
