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

/** Attaches req.staffUser if a valid staff session cookie is present; never rejects. */
export const attachStaffUser: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[STAFF_SESSION_COOKIE] as string | undefined;
    const user = await getStaffUserFromToken(token);
    if (user) req.staffUser = user;
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
