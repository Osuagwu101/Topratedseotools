import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const toolServersTable = pgTable("tool_servers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  label: text("label").notNull().default("Server 1"),
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
