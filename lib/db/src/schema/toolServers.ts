import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const toolServersTable = pgTable("tool_servers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  label: text("label").notNull().default("Server 1"),
  // Encrypted at rest (AES-256-GCM) via api-server/src/lib/toolCredentials.ts
  // — never read/write these columns directly; always go through those
  // helpers so values stay encrypted in every code path, including in a
  // raw database backup/export.
  username: text("username"),
  password: text("password"),
  loginUrl: text("login_url"),
  usernameField: text("username_field").default("email"),
  passwordField: text("password_field").default("password"),
  isAutoLogin: boolean("is_auto_login").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ToolServer = typeof toolServersTable.$inferSelect;
