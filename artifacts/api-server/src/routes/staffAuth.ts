import { Router, type IRouter, type RequestHandler } from "express";
import { db, staffUsersTable, staffRoles, blogPostsTable, staffSessionsTable, type StaffRole } from "@workspace/db";
import { eq, ne, and, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  STAFF_SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createStaffSession,
  destroyStaffSession,
  attachStaffUser,
  requireStaffRole,
  slugifyAuthor,
} from "../lib/staffAuth";

const router: IRouter = Router();

// Legacy single-credential admin gate, reused only to bootstrap/manage staff
// accounts — the site owner provisions staff logins; staff then use their own
// session-based login for day-to-day Blog CMS work.
const requireLegacyAdmin: RequestHandler = (req, res, next) => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    res.status(503).json({ error: "Admin credentials not configured." });
    return;
  }
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
  const u = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
  const p = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
  if (u !== adminUsername || p !== adminPassword) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  next();
};

router.use(attachStaffUser);

function sanitizeStaff(user: typeof staffUsersTable.$inferSelect) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

// ── Staff login/logout/me ────────────────────────────────────────────────────

router.post("/blog/staff/login", async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
    const [user] = await db
      .select()
      .from(staffUsersTable)
      .where(eq(staffUsersTable.email, email.trim().toLowerCase()))
      .limit(1);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    const token = await createStaffSession(user.id, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });
    res.cookie(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14,
      path: "/",
    });
    res.json(sanitizeStaff(user));
  } catch (err) {
    logger.error({ err }, "Staff login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/blog/staff/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.[STAFF_SESSION_COOKIE] as string | undefined;
  if (token) await destroyStaffSession(token);
  res.clearCookie(STAFF_SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/blog/staff/me", (req, res): void => {
  if (!req.staffUser) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.json(sanitizeStaff(req.staffUser));
});

// ── Staff account management (administrator only, or legacy admin to bootstrap) ──

async function anyAdministratorExists(): Promise<boolean> {
  const [row] = await db
    .select({ id: staffUsersTable.id })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.role, "administrator"))
    .limit(1);
  return !!row;
}

// Gate: if no administrator exists yet, allow the legacy admin credential to
// create the first one; afterwards, only an existing administrator may manage
// staff accounts.
const requireStaffManager: RequestHandler = async (req, res, next) => {
  if (await anyAdministratorExists()) {
    return requireStaffRole("administrator")(req, res, next);
  }
  return requireLegacyAdmin(req, res, next);
};

router.get("/admin/blog/staff", requireStaffManager, async (_req, res): Promise<void> => {
  const rows = await db.select().from(staffUsersTable).orderBy(staffUsersTable.id);
  res.json(rows.map(sanitizeStaff));
});

router.post("/admin/blog/staff", requireStaffManager, async (req, res): Promise<void> => {
  try {
    const { email, password, name, role, bio, avatarUrl } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
      bio?: string;
      avatarUrl?: string;
    };
    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password and name are required." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const resolvedRole: StaffRole = staffRoles.includes(role as StaffRole) ? (role as StaffRole) : "author";

    let slug = slugifyAuthor(name);
    let n = 2;
    while (true) {
      const [existing] = await db
        .select({ id: staffUsersTable.id })
        .from(staffUsersTable)
        .where(eq(staffUsersTable.authorSlug, slug))
        .limit(1);
      if (!existing) break;
      slug = `${slugifyAuthor(name)}-${n}`;
      n += 1;
    }

    const [created] = await db
      .insert(staffUsersTable)
      .values({
        email: email.trim().toLowerCase(),
        passwordHash: hashPassword(password),
        name: name.trim(),
        role: resolvedRole,
        authorSlug: slug,
        bio: bio?.trim() || null,
        avatarUrl: avatarUrl?.trim() || null,
      })
      .returning();
    res.status(201).json(sanitizeStaff(created));
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A staff account with that email already exists." });
      return;
    }
    logger.error({ err }, "Failed to create staff account");
    res.status(500).json({ error: "Failed to create staff account" });
  }
});

router.put("/admin/blog/staff/:id", requireStaffManager, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (typeof body.bio === "string") updates.bio = body.bio.trim();
    if (typeof body.avatarUrl === "string") updates.avatarUrl = body.avatarUrl.trim();
    if (typeof body.role === "string" && staffRoles.includes(body.role as StaffRole)) updates.role = body.role;
    if (typeof body.active === "boolean") {
      // Prevent locking out the last active administrator.
      if (!body.active) {
        const [target] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.id, id)).limit(1);
        if (target?.role === "administrator") {
          const [otherAdmin] = await db
            .select({ id: staffUsersTable.id })
            .from(staffUsersTable)
            .where(and(eq(staffUsersTable.role, "administrator"), eq(staffUsersTable.active, true), ne(staffUsersTable.id, id)))
            .limit(1);
          if (!otherAdmin) {
            res.status(400).json({ error: "Cannot deactivate the last active administrator." });
            return;
          }
        }
      }
      updates.active = body.active;
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters." });
        return;
      }
      updates.passwordHash = hashPassword(body.password);
    }

    const [updated] = await db.update(staffUsersTable).set(updates as never).where(eq(staffUsersTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(sanitizeStaff(updated));
  } catch (err) {
    logger.error({ err }, "Failed to update staff account");
    res.status(500).json({ error: "Failed to update staff account" });
  }
});

router.delete("/admin/blog/staff/:id", requireStaffManager, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (req.staffUser?.id === id) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    const [target] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.id, id)).limit(1);
    if (!target) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (target.role === "administrator") {
      const [otherAdmin] = await db
        .select({ id: staffUsersTable.id })
        .from(staffUsersTable)
        .where(and(eq(staffUsersTable.role, "administrator"), eq(staffUsersTable.active, true), ne(staffUsersTable.id, id)))
        .limit(1);
      if (!otherAdmin) {
        res.status(400).json({ error: "Cannot delete the last active administrator." });
        return;
      }
    }
    const [authored] = await db
      .select({ id: blogPostsTable.id })
      .from(blogPostsTable)
      .where(or(eq(blogPostsTable.authorId, id), eq(blogPostsTable.createdBy, id), eq(blogPostsTable.updatedBy, id)))
      .limit(1);
    if (authored) {
      res.status(409).json({
        error: "This user has authored or edited posts. Deactivate the account instead of deleting it to keep attribution intact.",
      });
      return;
    }
    await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffUserId, id));
    await db.delete(staffUsersTable).where(eq(staffUsersTable.id, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete staff account");
    res.status(500).json({ error: "Failed to delete staff account" });
  }
});

// Public author listing (byline links) — no auth required, only active staff.
router.get("/blog/authors", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: staffUsersTable.id,
      name: staffUsersTable.name,
      authorSlug: staffUsersTable.authorSlug,
      bio: staffUsersTable.bio,
      avatarUrl: staffUsersTable.avatarUrl,
    })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.active, true));
  res.json(rows);
});

router.get("/blog/authors/:slug", async (req, res): Promise<void> => {
  const [author] = await db
    .select({
      id: staffUsersTable.id,
      name: staffUsersTable.name,
      authorSlug: staffUsersTable.authorSlug,
      bio: staffUsersTable.bio,
      avatarUrl: staffUsersTable.avatarUrl,
    })
    .from(staffUsersTable)
    .where(and(eq(staffUsersTable.authorSlug, req.params.slug), eq(staffUsersTable.active, true)))
    .limit(1);
  if (!author) {
    res.status(404).json({ error: "Author not found" });
    return;
  }
  res.json(author);
});

export default router;
export { attachStaffUser, requireStaffRole };
