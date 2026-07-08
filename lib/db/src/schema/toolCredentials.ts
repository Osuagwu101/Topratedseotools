import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const toolCredentialsTable = pgTable("tool_credentials", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().unique(),
  username: text("username"),
  password: text("password"),
  loginUrl: text("login_url"),
  usernameField: text("username_field").default("email"),
  passwordField: text("password_field").default("password"),
  isAutoLogin: boolean("is_auto_login").notNull().default(false),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ToolCredential = typeof toolCredentialsTable.$inferSelect;
