import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import multer from "multer";
import {
  db,
  toolServersTable,
  productsTable,
  userDeviceSessionsTable,
  ordersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";
import { activateOrderByReference } from "../lib/activateOrder";
import { logger } from "../lib/logger";
import { parseUserAgent } from "../lib/userAgent";
import { analyzeImage, processAndStoreToolImage, STANDARD_IMAGE_SIZE } from "../lib/toolImages";

const router: IRouter = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

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

// ── Products (with servers + pricing) ────────────────────────────────────────

router.get("/admin/products", requireAdmin, async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.id);
  const servers = await db.select().from(toolServersTable).orderBy(toolServersTable.id);

  const serversByProduct: Record<number, (typeof toolServersTable.$inferSelect)[]> = {};
  for (const s of servers) {
    (serversByProduct[s.productId] ??= []).push(s);
  }

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      billingPeriod: p.billingPeriod,
      imageUrl: p.imageUrl,
      priceKobo: p.priceKobo,
      price3MonthKobo: p.price3MonthKobo,
      price12MonthKobo: p.price12MonthKobo,
      servers: serversByProduct[p.id] ?? [],
    })),
  );
});

// ── Tool images ──────────────────────────────────────────────────────────────

// Inspect an uploaded image's dimensions without storing anything, so the
// admin UI can prompt for a resize confirmation before committing the upload.
router.post(
  "/admin/products/:id/image/analyze",
  requireAdmin,
  imageUpload.single("image"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }
    try {
      const { width, height, matchesStandard } = await analyzeImage(req.file.buffer);
      res.json({ width, height, matchesStandard, standardSize: STANDARD_IMAGE_SIZE });
    } catch (err) {
      logger.error({ err }, "Failed to analyze uploaded tool image");
      res.status(400).json({ error: "Could not read image dimensions" });
    }
  },
);

// Process (resize to the standard square, preserving aspect ratio via padding,
// and optimize) and store the uploaded image, then attach it to the product.
router.post(
  "/admin/products/:id/image",
  requireAdmin,
  imageUpload.single("image"),
  async (req, res): Promise<void> => {
    const productId = parseInt(String(req.params.id), 10);
    if (isNaN(productId)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    try {
      const imageUrl = await processAndStoreToolImage(req.file.buffer, productId);
      const [updated] = await db
        .update(productsTable)
        .set({ imageUrl })
        .where(eq(productsTable.id, productId))
        .returning();
      res.status(201).json(updated);
    } catch (err) {
      logger.error({ err, productId }, "Failed to process/store tool image");
      res.status(500).json({ error: "Failed to process and store image" });
    }
  },
);

router.delete("/admin/products/:id/image", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ imageUrl: null })
    .where(eq(productsTable.id, productId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(updated);
});

// Update tiered pricing for a product
router.put("/admin/products/:id/pricing", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const body = req.body as {
    priceKobo?: unknown;
    price3MonthKobo?: unknown;
    price12MonthKobo?: unknown;
  };

  const toNullableInt = (v: unknown): number | null | undefined => {
    if (v === null) return null;
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    return undefined;
  };

  const priceKobo = typeof body.priceKobo === "number" ? Math.round(body.priceKobo) : undefined;
  const price3MonthKobo = toNullableInt(body.price3MonthKobo);
  const price12MonthKobo = toNullableInt(body.price12MonthKobo);

  const updates: Record<string, number | null> = {};
  if (priceKobo !== undefined) updates.priceKobo = priceKobo;
  if (price3MonthKobo !== undefined) updates.price3MonthKobo = price3MonthKobo;
  if (price12MonthKobo !== undefined) updates.price12MonthKobo = price12MonthKobo;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid pricing fields provided" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set(updates)
    .where(eq(productsTable.id, productId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(updated);
});

// ── Tool servers (multiple credential sets per product) ─────────────────────

router.post("/admin/servers", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    productId?: unknown;
    label?: unknown;
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

  const [created] = await db
    .insert(toolServersTable)
    .values({
      productId,
      label: typeof body.label === "string" && body.label.trim() ? body.label : "Server",
      username: typeof body.username === "string" ? body.username : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
      usernameField: typeof body.usernameField === "string" ? body.usernameField : undefined,
      passwordField: typeof body.passwordField === "string" ? body.passwordField : undefined,
      isAutoLogin: typeof body.isAutoLogin === "boolean" ? body.isAutoLogin : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    })
    .returning();

  res.status(201).json(created);
});

router.put("/admin/servers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid server id" });
    return;
  }

  const body = req.body as {
    label?: unknown;
    username?: unknown;
    password?: unknown;
    loginUrl?: unknown;
    usernameField?: unknown;
    passwordField?: unknown;
    isAutoLogin?: unknown;
    notes?: unknown;
  };

  const fields = {
    label: typeof body.label === "string" ? body.label : undefined,
    username: typeof body.username === "string" ? body.username : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
    usernameField: typeof body.usernameField === "string" ? body.usernameField : undefined,
    passwordField: typeof body.passwordField === "string" ? body.passwordField : undefined,
    isAutoLogin: typeof body.isAutoLogin === "boolean" ? body.isAutoLogin : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };

  const [updated] = await db
    .update(toolServersTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(toolServersTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Server not found" });
    return;
  }

  res.json(updated);
});

router.delete("/admin/servers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid server id" });
    return;
  }

  await db.delete(toolServersTable).where(eq(toolServersTable.id, id));
  res.json({ ok: true });
});

// ── Device sessions ───────────────────────────────────────────────────────────

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

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const emailByUserId: Record<string, string | null> = {};
  if (userIds.length > 0) {
    try {
      const result = await clerkClient.users.getUserList({ userId: userIds, limit: userIds.length });
      for (const u of result.data) {
        emailByUserId[u.id] =
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
          ?? u.emailAddresses[0]?.emailAddress
          ?? null;
      }
    } catch (err) {
      logger.error({ err }, "Failed to look up Clerk emails for device sessions");
    }
  }

  const grouped: Record<
    string,
    {
      deviceId: string;
      userAgent: string | null;
      browser: string;
      os: string;
      deviceType: string;
      ipAddress: string | null;
      createdAt: string;
      lastSeenAt: string;
    }[]
  > = {};
  for (const r of rows) {
    if (!grouped[r.userId]) grouped[r.userId] = [];
    const parsed = parseUserAgent(r.userAgent);
    grouped[r.userId].push({
      deviceId: r.deviceId,
      userAgent: r.userAgent,
      browser: parsed.browser,
      os: parsed.os,
      deviceType: parsed.deviceType,
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
      email: emailByUserId[c.userId] ?? null,
      deviceCount: c.count,
      devices: grouped[c.userId] ?? [],
      suspended: c.count > 3,
    }))
  );
});

router.delete("/admin/device-sessions/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = String(req.params.userId ?? "").trim();
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  await db.delete(userDeviceSessionsTable).where(eq(userDeviceSessionsTable.userId, userId));
  res.json({ ok: true, message: `Device sessions cleared for ${userId}` });
});

// ── User management (Clerk) ──────────────────────────────────────────────────

// Search users by email/name so the admin can find someone to grant access to.
router.get("/admin/users/search", requireAdmin, async (req, res): Promise<void> => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    res.json([]);
    return;
  }

  try {
    const result = await clerkClient.users.getUserList({ query, limit: 20 });
    res.json(
      result.data.map((u) => ({
        id: u.id,
        email: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
          ?? u.emailAddresses[0]?.emailAddress
          ?? null,
        firstName: u.firstName,
        lastName: u.lastName,
        createdAt: new Date(u.createdAt).toISOString(),
      })),
    );
  } catch (err) {
    logger.error({ err }, "Clerk user search failed");
    res.status(502).json({ error: "Failed to search users" });
  }
});

// Create a new Clerk user (e.g. for customers the admin onboards manually).
router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    emailAddress?: unknown;
    password?: unknown;
    firstName?: unknown;
    lastName?: unknown;
  };

  const emailAddress = typeof body.emailAddress === "string" ? body.emailAddress.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!emailAddress || !password) {
    res.status(400).json({ error: "emailAddress and password are required" });
    return;
  }

  try {
    const user = await clerkClient.users.createUser({
      emailAddress: [emailAddress],
      password,
      firstName: typeof body.firstName === "string" ? body.firstName : undefined,
      lastName: typeof body.lastName === "string" ? body.lastName : undefined,
      skipPasswordChecks: true,
    });

    res.status(201).json({
      id: user.id,
      email: emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  } catch (err) {
    logger.error({ err }, "Clerk user creation failed");
    const message = err instanceof Error ? err.message : "Failed to create user";
    res.status(400).json({ error: message });
  }
});

// ── Manual entitlement grant (bypasses Paystack) ─────────────────────────────

router.post("/admin/grant", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    clerkUserId?: unknown;
    productId?: unknown;
    durationMonths?: unknown;
    serverId?: unknown;
  };

  const clerkUserId = typeof body.clerkUserId === "string" ? body.clerkUserId.trim() : "";
  const productId = typeof body.productId === "number" ? body.productId : null;
  const durationMonths = typeof body.durationMonths === "number" ? body.durationMonths : 1;
  const serverId = typeof body.serverId === "number" ? body.serverId : null;

  if (!clerkUserId || !productId) {
    res.status(400).json({ error: "clerkUserId and productId are required" });
    return;
  }

  if (![1, 3, 12].includes(durationMonths)) {
    res.status(400).json({ error: "durationMonths must be 1, 3, or 12" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  if (serverId) {
    const [server] = await db.select().from(toolServersTable).where(eq(toolServersTable.id, serverId));
    if (!server || server.productId !== productId) {
      res.status(400).json({ error: "serverId does not belong to this product" });
      return;
    }
  }

  const reference = `MANUAL-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  const [order] = await db
    .insert(ordersTable)
    .values({
      productId,
      customerEmail: "admin-grant@subshub.internal",
      customerName: "Manual admin grant",
      amountKobo: 0,
      status: "pending",
      reference,
      clerkUserId,
      durationMonths,
    })
    .returning();

  const result = await activateOrderByReference(reference, 0, serverId);

  if (result.outcome === "failed") {
    res.status(500).json({ error: "Failed to activate manual grant" });
    return;
  }

  logger.info({ clerkUserId, productId, orderId: order.id }, "Manual entitlement grant issued");
  res.status(201).json({ ok: true, orderId: order.id, reference, outcome: result.outcome });
});

export default router;
