import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const analyticsSettingsTable = pgTable("analytics_settings", {
  id: integer("id").primaryKey().default(1),
  metaPixelEnabled: boolean("meta_pixel_enabled").notNull().default(false),
  metaPixelId: text("meta_pixel_id"),
  metaCapiEnabled: boolean("meta_capi_enabled").notNull().default(false),
  metaCapiTokenEncrypted: text("meta_capi_token_encrypted"),
  metaTestEventCode: text("meta_test_event_code"),
  gtmEnabled: boolean("gtm_enabled").notNull().default(false),
  gtmContainerId: text("gtm_container_id"),
  siteUrl: text("site_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by"),
});

export type AnalyticsSettings = typeof analyticsSettingsTable.$inferSelect;
