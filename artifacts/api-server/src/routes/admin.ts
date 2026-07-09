import { Router, type IRouter, type RequestHandler } from "express";
import { db, toolCredentialsTable, productsTable, userDeviceSessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    res.status(503).json({ error: "Admin credentials not configured (ADMIN_USERNAME / ADMIN_PASSWORD)." });
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

// List all products with their credentials
router.get("/admin/products", requireAdmin, async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.id);
  const creds = await db.select().from(toolCredentialsTable);
  const credMap = Object.fromEntries(creds.map((c) => [c.productId, c]));

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      credential: credMap[p.id] ?? null,
    }))
  );
});

// Create or update credential for a product
router.post("/admin/credentials", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    productId?: unknown;
    username?: unknown;
    password?: unknown;
    loginUrl?: unknown;
    usernameField?: unknown;
    passwordField?: unknown;
    isAutoLogin?: unknown;
    notes?: unknown;
  };

  const productId = typeof body.productId === "number" ? body.productId : null;
  if (!productId) {
    res.status(400).json({ error: "productId is required and must be a number" });
    return;
  }

  const fields = {
    username: typeof body.username === "string" ? body.username : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
    usernameField: typeof body.usernameField === "string" ? body.usernameField : undefined,
    passwordField: typeof body.passwordField === "string" ? body.passwordField : undefined,
    isAutoLogin: typeof body.isAutoLogin === "boolean" ? body.isAutoLogin : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };

  const existing = await db
    .select()
    .from(toolCredentialsTable)
    .where(eq(toolCredentialsTable.productId, productId));

  if (existing.length > 0) {
    const [updated] = await db
      .update(toolCredentialsTable)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(toolCredentialsTable.productId, productId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(toolCredentialsTable)
      .values({ productId, ...fields })
      .returning();
    res.json(created);
  }
});

// List all device sessions grouped by userId
router.get("/admin/device-sessions", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: userDeviceSessionsTable.userId,
      deviceId: userDeviceSessionsTable.deviceId,
      userAgent: userDeviceSessionsTable.userAgent,
      ipAddress: userDeviceSessionsTable.ipAddress,
      createdAt: userDeviceSessionsTable.createdAt,
      lastSeenAt: userDeviceSessionsTable.lastSeenAt,
    })
    .from(userDeviceSessionsTable)
    .orderBy(userDeviceSessionsTable.userId, userDeviceSessionsTable.lastSeenAt);

  const grouped: Record<string, { deviceId: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastSeenAt: string }[]> = {};
  for (const r of rows) {
    if (!grouped[r.userId]) grouped[r.userId] = [];
    grouped[r.userId].push({
      deviceId: r.deviceId,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
    });
  }

  const counts = await db
    .select({ userId: userDeviceSessionsTable.userId, count: sql<number>`cast(count(*) as int)` })
    .from(userDeviceSessionsTable)
    .groupBy(userDeviceSessionsTable.userId);

  res.json(
    counts.map((c) => ({
      userId: c.userId,
      deviceCount: c.count,
      devices: grouped[c.userId] ?? [],
      suspended: c.count > 3,
    }))
  );
});

// Clear all device sessions for a user (unsuspend)
router.delete("/admin/device-sessions/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId ?? "").trim();
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  await db.delete(userDeviceSessionsTable).where(eq(userDeviceSessionsTable.userId, userId));
  res.json({ ok: true, message: `Device sessions cleared for ${userId}` });
});

export default router;
