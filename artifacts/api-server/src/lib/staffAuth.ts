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

// The Blog CMS no longer requires its own separate sign-in: anyone who is
// already authenticated into the main admin dashboard (the legacy
// ADMIN_USERNAME/ADMIN_PASSWORD basic-auth credential) is automatically
// treated as a Blog CMS administrator. We still keep the staff_users table
// and session cookie plumbing around (for any additional editor/author
// accounts created via the Staff panel), but reaching the CMS from /admin no
// longer prompts for a second login.
function isLegacyAdminRequest(req: { headers: { authorization?: string } }): boolean {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) return false;
  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  } catch {
    return false;
  }
  const colonIdx = decoded.indexOf(":");
  const u = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
  const p = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
  return u === adminUsername && p === adminPassword;
}

const AUTO_ADMIN_EMAIL = "owner@blog.internal";
const AUTO_ADMIN_SLUG = "site-owner";
let cachedAutoAdminId: number | null = null;

/**
 * Finds or creates the single "site owner" staff account that any legacy
 * admin-authenticated request is auto-signed-in as. Idempotent and safe to
 * call concurrently (falls back to a re-select on a unique-constraint race).
 */
export async function ensureAutoAdministrator(): Promise<StaffUser> {
  if (cachedAutoAdminId) {
    const [existing] = await db
      .select()
      .from(staffUsersTable)
      .where(eq(staffUsersTable.id, cachedAutoAdminId))
      .limit(1);
    if (existing) return existing;
    cachedAutoAdminId = null;
  }
  const [existing] = await db
    .select()
    .from(staffUsersTable)
    .where(eq(staffUsersTable.email, AUTO_ADMIN_EMAIL))
    .limit(1);
  if (existing) {
    cachedAutoAdminId = existing.id;
    return existing;
  }
  try {
    const [created] = await db
      .insert(staffUsersTable)
      .values({
        email: AUTO_ADMIN_EMAIL,
        passwordHash: hashPassword(randomBytes(32).toString("hex")),
        name: "Site Owner",
        role: "administrator",
        authorSlug: AUTO_ADMIN_SLUG,
        active: true,
      })
      .returning();
    cachedAutoAdminId = created.id;
    return created;
  } catch {
    // Unique-constraint race: another request created it first.
    const [race] = await db
      .select()
      .from(staffUsersTable)
      .where(eq(staffUsersTable.email, AUTO_ADMIN_EMAIL))
      .limit(1);
    if (!race) throw new Error("Failed to provision the auto-administrator staff account.");
    cachedAutoAdminId = race.id;
    return race;
  }
}

/**
 * Attaches req.staffUser if a valid staff session cookie is present, or if
 * the request carries valid legacy admin basic-auth credentials (in which
 * case it is auto-signed-in as the site-owner administrator). When the
 * legacy-auth path is used, it also mints a real staff session cookie so
 * that subsequent same-origin CMS requests -- which rely on the cookie, not
 * the Authorization header -- stay signed in without re-checking the legacy
 * credential every time. Never rejects.
 */
export const attachStaffUser: RequestHandler = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.[STAFF_SESSION_COOKIE] as string | undefined;
    const user = await getStaffUserFromToken(cookieToken);
    if (user) {
      req.staffUser = user;
    } else if (isLegacyAdminRequest(req)) {
      const autoAdmin = await ensureAutoAdministrator();
      req.staffUser = autoAdmin;
      const sessionToken = await createStaffSession(autoAdmin.id, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      res.cookie(STAFF_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
    }
  } catch {
    // ignore — treated as unauthenticated
  }
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
