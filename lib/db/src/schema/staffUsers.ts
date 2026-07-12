import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Staff accounts for the Blog CMS (separate from the legacy single-credential
// ADMIN_USERNAME/ADMIN_PASSWORD basic-auth admin, and separate from Clerk
// customer accounts). Roles gate what a staff member can do in the blog CMS:
//  - administrator: full access, including settings, SEO, authors, deletion.
//  - editor: create/edit/review/schedule/publish posts, manage categories/tags/media.
//  - author: create/edit their own posts, upload media, submit for review only.
export const staffRoles = ["administrator", "editor", "author"] as const;
export type StaffRole = (typeof staffRoles)[number];

export const staffUsersTable = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("author"), // StaffRole
  // Public author byline fields, used on /blog/author/[slug].
  authorSlug: text("author_slug").notNull().unique(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffUserSchema = createInsertSchema(staffUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStaffUser = z.infer<typeof insertStaffUserSchema>;
export type StaffUser = typeof staffUsersTable.$inferSelect;

// Session tokens for staff logins (cookie-based, DB-backed so they can be
// revoked). Not reused for customer auth (Clerk) or the legacy admin basic auth.
export const staffSessionsTable = pgTable("staff_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  staffUserId: integer("staff_user_id").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type StaffSession = typeof staffSessionsTable.$inferSelect;
