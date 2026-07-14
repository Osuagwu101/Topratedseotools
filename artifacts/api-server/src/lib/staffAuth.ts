import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { RequestHandler } from "express";
import { db, staffUsersTable, staffSessionsTable, type StaffRole, type StaffUser } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

export const STAFF_SESSION_COOKIE = "staff_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function createStaffSession(
  staffUserId: number,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(staffSessionsTable).values({
    token,
    staffUserId,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ipAddress ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  // Best-effort cleanup of expired sessions; not load-bearing so failures are ignored.
  db.delete(staffSessionsTable).where(lt(staffSessionsTable.expiresAt, new Date())).catch(() => {});
  return token;
}

export async function destroyStaffSession(token: string): Promise<void> {
  await db.delete(staffSessionsTable).where(eq(staffSessionsTable.token, token));
}

export async function getStaffUserFromToken(token: string | undefined): Promise<StaffUser | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(staffSessionsTable)
    .where(eq(staffSessionsTable.token, token))
    .limit(1);
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  const [user] = await db
    .select()
    .from(staffUsersTable)
    .where(eq(staffUsersTable.id, session.staffUserId))
    .limit(1);
  if (!user || !user.active) return null;
  return user;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffUser?: StaffUser;
    }
  }
}

const AUTO_ADMIN_SLUG = "site-owner";
const SITE_OWNER_SUFFIX = "@site-owner.local";

/** Turns a bare "username" into a login email, matching how bootstrapSuperAdminIfNeeded() names the account. */
function normalizeLoginIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}${SITE_OWNER_SUFFIX}`;
}

/**
 * Ensures at least one real `administrator` staff account exists so the
 * Super Admin dashboard and System Configuration Centre are never locked
 * out. Runs once at server startup. If an administrator already exists,
 * this is a no-op. Otherwise, if legacy ADMIN_USERNAME/ADMIN_PASSWORD are
 * present, it provisions (or upgrades) one real staff account from them —
 * replacing the old "any Basic-Auth request matching a shared env
 * credential gets auto-signed-in" bridge with a single, real, auditable
 * account that must be signed into explicitly (or used directly with
 * requireSuperAdmin's per-request Basic Auth, now checked against this
 * account's hashed password instead of a shared secret).
 */
export async function bootstrapSuperAdminIfNeeded(): Promise<void> {
  const [anyAdmin] = await db
    .select({ id: staffUsersTable.id })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.role, "administrator"))
    .limit(1);
  if (anyAdmin) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    return; // already logged as info by startupValidation.ts
  }

  const email = normalizeLoginIdentifier(username);
  const [existingByEmail] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.email, email)).limit(1);
  if (existingByEmail) {
    await db
      .update(staffUsersTable)
      .set({ role: "administrator", passwordHash: hashPassword(password), active: true, updatedAt: new Date() })
      .where(eq(staffUsersTable.id, existingByEmail.id));
    return;
  }

  let slug = AUTO_ADMIN_SLUG;
  let n = 2;
  while (true) {
    const [existing] = await db.select({ id: staffUsersTable.id }).from(staffUsersTable).where(eq(staffUsersTable.authorSlug, slug)).limit(1);
    if (!existing) break;
    slug = `${AUTO_ADMIN_SLUG}-${n}`;
    n += 1;
  }

  await db.insert(staffUsersTable).values({
    email,
    passwordHash: hashPassword(password),
    name: "Site Owner",
    role: "administrator",
    authorSlug: slug,
    active: true,
  });
}

/** Attaches req.staffUser if a valid staff session cookie is present. Never rejects. */
export const attachStaffUser: RequestHandler = async (req, _res, next) => {
  try {
    const cookieToken = req.cookies?.[STAFF_SESSION_COOKIE] as string | undefined;
    const user = await getStaffUserFromToken(cookieToken);
    if (user) req.staffUser = user;
  } catch {
    // ignore — treated as unauthenticated
  }
  next();
};

/**
 * Super Admin gate for legacy Basic-Auth-style admin routes (dashboard,
 * products, homepage/site settings, trust content, tool assignments, System
 * Configuration Centre, ...). Unlike the old per-file requireAdmin() copies,
 * this checks the Authorization header's credentials against a real
 * staff_users row (administrator role, scrypt-hashed password) instead of a
 * single shared ADMIN_USERNAME/ADMIN_PASSWORD pair — so access is per-person
 * and auditable, and can be revoked per-account. The frontend admin login
 * form is unchanged: whatever the operator types as "username" is treated
 * as their staff email (see normalizeLoginIdentifier).
 */
export const requireSuperAdmin: RequestHandler = async (req, res, next) => {
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const colonIdx = decoded.indexOf(":");
  const rawUser = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
  const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
  if (!rawUser || !password) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  const email = normalizeLoginIdentifier(rawUser);
  const [user] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.email, email)).limit(1);
  if (!user || !user.active || user.role !== "administrator" || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  req.staffUser = user;
  next();
};

/** Rejects unless req.staffUser is set and has one of the allowed roles. */
export function requireStaffRole(...allowedRoles: StaffRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.staffUser) {
      res.status(401).json({ error: "Staff login required." });
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.staffUser.role as StaffRole)) {
      res.status(403).json({ error: "You do not have permission to do this." });
      return;
    }
    next();
  };
}

export function slugifyAuthor(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `author-${randomBytes(3).toString("hex")}`;
}
