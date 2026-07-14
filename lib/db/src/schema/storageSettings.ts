import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Single-row table (id=1), same convention as siteSettingsTable/paymentSettingsTable.
// Governs which file-storage backend the app writes to (Replit's managed bucket,
// a self-hosted / third-party S3-compatible bucket, or local disk on a VPS) and
// each backend's non-secret connection parameters. This is the whole point of
// portability: switching hosting providers should only require changing the
// row here (or the matching env vars), never editing code.
//
// The S3 backend's credentials (access key id / secret access key) are secrets
// and deliberately live in the System Configuration Centre's encrypted vault
// (systemConfig.ts) instead of here, same split as paymentSettingsTable vs.
// PAYSTACK_SECRET_KEY.
export const storageSettingsTable = pgTable("storage_settings", {
  id: serial("id").primaryKey(),
  // "replit" | "s3" | "local" — validated in application code, not a DB enum,
  // so adding a future backend never needs a migration.
  backend: text("backend").notNull().default("replit"),
  // local backend: absolute or relative-to-cwd directory files are written to.
  localDir: text("local_dir").notNull().default("./storage-data"),
  // local backend: the base URL path public files are served from (the app
  // always fronts local-disk files through its own Express route since a
  // bare VPS has no bucket to expose them from directly).
  localPublicBaseUrl: text("local_public_base_url"),
  // s3 backend: bucket name, region, and endpoint (leave endpoint blank for
  // real AWS S3; set it for MinIO / DigitalOcean Spaces / Hostinger Object
  // Storage / any other S3-compatible provider).
  s3Bucket: text("s3_bucket"),
  s3Region: text("s3_region").default("us-east-1"),
  s3Endpoint: text("s3_endpoint"),
  // Most non-AWS S3-compatible providers require path-style addressing
  // (https://endpoint/bucket/key) instead of virtual-hosted-style.
  s3ForcePathStyle: boolean("s3_force_path_style").notNull().default(false),
  // Optional custom public base URL (e.g. a CDN in front of the bucket) used
  // to build public file URLs instead of the bucket's own endpoint URL.
  s3PublicBaseUrl: text("s3_public_base_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedByEmail: text("updated_by_email"),
});

export type StorageSettings = typeof storageSettingsTable.$inferSelect;
