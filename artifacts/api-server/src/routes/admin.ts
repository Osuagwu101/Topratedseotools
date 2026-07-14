import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import multer from "multer";
import {
  db,
  toolServersTable,
  productsTable,
  userDeviceSessionsTable,
  ordersTable,
  conversionEventsTable,
} from "@workspace/db";
import { sendCapiEvent } from "../lib/metaCapi";
import {
  getIntegrationSettings,
  saveMetaPixelSettings,
  saveMetaCapiSettings,
  saveGtmSettings,
} from "../lib/analyticsSettings";
import { and, count, desc, eq, gte, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { activateOrderByReference } from "../lib/activateOrder";
import { logger } from "../lib/logger";
import { parseUserAgent } from "../lib/userAgent";
import { analyzeImage, processAndStoreToolImage, STANDARD_IMAGE_SIZE } from "../lib/toolImages";
import { loginToTool, setSession, invalidateSessionsForProduct } from "../lib/toolSession";
import { getDisplayedCustomersServed } from "./trust";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  encryptToolField,
  maskServerCredentials,
  isUnchangedMaskedValue,
} from "../lib/toolCredentials";

const router: IRouter = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Shared Super Admin gate — see lib/staffAuth.ts. Kept as a local alias so
// the rest of this file's route registrations don't need to change.
const requireAdmin: RequestHandler = requireSuperAdmin;

// ── Dashboard stats ──────────────────────────────────────────────────────────
// Powers the admin landing page: overall totals plus a date-range filter that
// narrows the sales count and earnings figure (customers/products stay overall).

router.get("/admin/dashboard/stats", requireAdmin, async (req, res): Promise<void> => {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : undefined;
  const toRaw = typeof req.query.to === "string" ? req.query.to : undefined;

  const fromDate = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : undefined;
  const toDate = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : undefined;

  if ((fromRaw && Number.isNaN(fromDate?.getTime())) || (toRaw && Number.isNaN(toDate?.getTime()))) {
    res.status(400).json({ error: "Invalid date range" });
    return;
  }

  const salesConditions = [eq(ordersTable.status, "success"), eq(ordersTable.settlementStatus, "valid")];
  if (fromDate) salesConditions.push(gte(ordersTable.createdAt, fromDate));
  if (toDate) salesConditions.push(lte(ordersTable.createdAt, toDate));

  const [[productsRow], [salesRow], customersCount] = await Promise.all([
    db.select({ count: count() }).from(productsTable).where(ne(productsTable.isDeleted, true)),
    db
      .select({ count: count(), totalKobo: sql<number>`coalesce(sum(${ordersTable.amountKobo}), 0)` })
      .from(ordersTable)
      .where(and(...salesConditions)),
    getDisplayedCustomersServed(),
  ]);

  res.json({
    productsCount: productsRow?.count ?? 0,
    customersCount,
    salesCount: salesRow?.count ?? 0,
    totalEarningsKobo: Number(salesRow?.totalKobo ?? 0),
    range: fromRaw || toRaw ? { from: fromRaw ?? null, to: toRaw ?? null } : null,
  });
});

// ── Products (with servers + pricing) ────────────────────────────────────────

router.get("/admin/products", requireAdmin, async (_req, res): Promise<void> => {
  // Deleted tools are permanently removed from admin management too; historical
  // orders still resolve their name/price via a direct row lookup, not this list.
  const products = await db
    .select()
    .from(productsTable)
    .where(ne(productsTable.isDeleted, true))
    .orderBy(productsTable.id);
  const servers = await db.select().from(toolServersTable).orderBy(toolServersTable.id);

  const serversByProduct: Record<number, ReturnType<typeof maskServerCredentials>[]> = {};
  for (const s of servers) {
    (serversByProduct[s.productId] ??= []).push(maskServerCredentials(s));
  }

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      fullDescription: p.fullDescription,
      category: p.category,
      billingPeriod: p.billingPeriod,
      imageUrl: p.imageUrl,
      priceKobo: p.priceKobo,
      price3MonthKobo: p.price3MonthKobo,
      price12MonthKobo: p.price12MonthKobo,
      isHidden: p.isHidden,
      oneClickAuthEnabled: p.oneClickAuthEnabled,
      maxDailyInputs: p.maxDailyInputs,
      featuredOrder: p.featuredOrder,
      homepageBlurb: p.homepageBlurb,
      servers: serversByProduct[p.id] ?? [],
    })),
  );
});

// Create a new tool. It becomes visible to users only after being saved here
// (and only if isHidden is not explicitly set to true).
router.post("/admin/products", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    name?: unknown;
    description?: unknown;
    fullDescription?: unknown;
    category?: unknown;
    billingPeriod?: unknown;
    priceKobo?: unknown;
    price3MonthKobo?: unknown;
    price12MonthKobo?: unknown;
    isHidden?: unknown;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const billingPeriod = typeof body.billingPeriod === "string" ? body.billingPeriod.trim() : "monthly";
  const priceKobo = typeof body.priceKobo === "number" ? Math.round(body.priceKobo) : NaN;

  if (!name || !description || !category || !Number.isFinite(priceKobo) || priceKobo < 0) {
    res.status(400).json({
      error: "name, description, category, and a valid priceKobo (1-month price) are required",
    });
    return;
  }

  const toNullableInt = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    return null;
  };

  const [created] = await db
    .insert(productsTable)
    .values({
      name,
      description,
      fullDescription: typeof body.fullDescription === "string" && body.fullDescription.trim()
        ? body.fullDescription.trim()
        : null,
      category,
      billingPeriod,
      priceKobo,
      price3MonthKobo: toNullableInt(body.price3MonthKobo),
      price12MonthKobo: toNullableInt(body.price12MonthKobo),
      isHidden: body.isHidden === true,
      features: [],
    })
    .returning();

  logger.info({ productId: created.id, name: created.name }, "New tool created by admin");
  res.status(201).json(created);
});

// Edit an existing tool's name/descriptions/category/billing period/visibility.
// Pricing has its own dedicated endpoint below (PUT /admin/products/:id/pricing).
router.put("/admin/products/:id", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const body = req.body as {
    name?: unknown;
    description?: unknown;
    fullDescription?: unknown;
    category?: unknown;
    billingPeriod?: unknown;
    isHidden?: unknown;
    crossSellProductIds?: unknown;
    upSellProductIds?: unknown;
    downSellProductIds?: unknown;
    featuredOrder?: unknown;
    homepageBlurb?: unknown;
  };

  const toIdArray = (value: unknown): number[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const ids = value
      .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
      .filter((v) => Number.isInteger(v) && v !== productId);
    return Array.from(new Set(ids));
  };

  const updates: Record<string, string | boolean | null | number | number[]> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.description === "string" && body.description.trim()) {
    updates.description = body.description.trim();
  }
  if (body.fullDescription === null) {
    updates.fullDescription = null;
  } else if (typeof body.fullDescription === "string") {
    updates.fullDescription = body.fullDescription.trim() || null;
  }
  if (typeof body.category === "string" && body.category.trim()) updates.category = body.category.trim();
  if (typeof body.billingPeriod === "string" && body.billingPeriod.trim()) {
    updates.billingPeriod = body.billingPeriod.trim();
  }
  if (typeof body.isHidden === "boolean") updates.isHidden = body.isHidden;
  const crossSellProductIds = toIdArray(body.crossSellProductIds);
  if (crossSellProductIds) updates.crossSellProductIds = crossSellProductIds;
  const upSellProductIds = toIdArray(body.upSellProductIds);
  if (upSellProductIds) updates.upSellProductIds = upSellProductIds;
  const downSellProductIds = toIdArray(body.downSellProductIds);
  if (downSellProductIds) updates.downSellProductIds = downSellProductIds;
  if (body.featuredOrder === null) {
    updates.featuredOrder = null;
  } else if (typeof body.featuredOrder === "number" && Number.isFinite(body.featuredOrder)) {
    updates.featuredOrder = Math.round(body.featuredOrder);
  }
  if (body.homepageBlurb === null) {
    updates.homepageBlurb = null;
  } else if (typeof body.homepageBlurb === "string") {
    updates.homepageBlurb = body.homepageBlurb.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields provided" });
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

// Reorder the homepage "Popular Tools" selection: body.ids is the full,
// ordered list of featured product ids (drag-and-drop order from the admin
// UI). Sets featuredOrder = index for each id in the list, and clears
// featuredOrder (unfeatures) for any currently-featured product left out of
// the list, e.g. after a drag-and-drop removal.
router.post("/admin/products/reorder", requireAdmin, async (req, res): Promise<void> => {
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number" || !Number.isInteger(id))) {
    res.status(400).json({ error: "ids must be an array of integer product ids" });
    return;
  }

  const featuredIds = ids as number[];
  await db.transaction(async (tx) => {
    await Promise.all(
      featuredIds.map((id, index) => tx.update(productsTable).set({ featuredOrder: index }).where(eq(productsTable.id, id))),
    );
    // Unfeature anything left out of the list, e.g. after a drag-and-drop
    // removal. When the list is empty this clears every currently-featured
    // product instead of being a no-op.
    const clearWhere =
      featuredIds.length > 0
        ? and(notInArray(productsTable.id, featuredIds), isNotNull(productsTable.featuredOrder))
        : isNotNull(productsTable.featuredOrder);
    await tx.update(productsTable).set({ featuredOrder: null }).where(clearWhere);
  });

  res.status(204).end();
});

// Hide/unhide a tool. Hiding removes it from the public storefront and blocks
// new purchases immediately, while leaving existing entitlements/orders intact.
router.put("/admin/products/:id/visibility", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const body = req.body as { isHidden?: unknown };
  if (typeof body.isHidden !== "boolean") {
    res.status(400).json({ error: "isHidden (boolean) is required" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ isHidden: body.isHidden })
    .where(eq(productsTable.id, productId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  logger.info({ productId, isHidden: body.isHidden }, "Tool visibility changed by admin");
  res.json(updated);
});

// Permanently remove a tool from the website. This is a soft delete: the row
// (and its historical orders/entitlements) is preserved for reporting and
// payment-history integrity, but the tool disappears from the storefront and
// from admin management, and can no longer be purchased.
router.delete("/admin/products/:id", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [updated] = await db
    .update(productsTable)
    .set({ isDeleted: true, isHidden: true })
    .where(eq(productsTable.id, productId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  logger.info({ productId }, "Tool deleted by admin");
  res.json({ ok: true });
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

// ── One-Click Auth (global per-tool toggle + master session capture) ───────

// Turning OFF is immediate: disable the toggle and drop any cached master
// session so a future re-enable always starts from a clean slate.
router.put("/admin/products/:id/one-click-auth", requireAdmin, async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.id), 10);
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const body = req.body as { enabled?: unknown };
  if (body.enabled !== false) {
    res.status(400).json({
      error: "Use POST /admin/products/:id/one-click-auth/activate to turn this on — it requires re-authentication.",
    });
    return;
  }

  await invalidateSessionsForProduct(productId);

  const [updated] = await db
    .update(productsTable)
    .set({ oneClickAuthEnabled: false })
    .where(eq(productsTable.id, productId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  logger.info({ productId }, "One-Click Auth disabled by admin; master session cleared");
  res.json(updated);
});

// Turning ON always re-authenticates: clears any stale session, logs in fresh
// with the tool's configured auto-login credentials to establish a new
// master session, and only then flips the toggle on.
router.post(
  "/admin/products/:id/one-click-auth/activate",
  requireAdmin,
  async (req, res): Promise<void> => {
    const productId = parseInt(String(req.params.id), 10);
    if (isNaN(productId)) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }

    const body = req.body as { maxDailyInputs?: unknown };
    let maxDailyInputs: number | null = null;
    if (body.maxDailyInputs !== undefined && body.maxDailyInputs !== null && body.maxDailyInputs !== "") {
      const n = Number(body.maxDailyInputs);
      if (!Number.isInteger(n) || n < 0) {
        res.status(400).json({
          error: "maxDailyInputs must be a whole positive number, or left empty/0 for unlimited.",
        });
        return;
      }
      maxDailyInputs = n === 0 ? null : n;
    }

    const [server] = await db
      .select()
      .from(toolServersTable)
      .where(and(eq(toolServersTable.productId, productId), eq(toolServersTable.isAutoLogin, true)))
      .orderBy(toolServersTable.id);

    if (!server || !server.loginUrl || !server.username || !server.password) {
      res.status(400).json({
        error:
          "Configure an Auto-Login server (login URL, username, password) for this tool before enabling One-Click Auth.",
      });
      return;
    }

    // Reset flow: always discard the old session before re-authenticating.
    await invalidateSessionsForProduct(productId);

    const session = await loginToTool(server);
    if (!session || (!session.cookie && !session.authHeader)) {
      res.status(502).json({
        error: "Could not log in to the provider with the stored credentials. Check them and try again.",
      });
      return;
    }

    setSession(server.id, session);

    const [updated] = await db
      .update(productsTable)
      .set({ oneClickAuthEnabled: true, maxDailyInputs })
      .where(eq(productsTable.id, productId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    logger.info(
      { productId, serverId: server.id, maxDailyInputs },
      "One-Click Auth enabled by admin; master session captured",
    );
    res.json(updated);
  },
);

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

  // Credentials arrive as plaintext from the admin form (there's no
  // existing masked value to compare against on create) and are encrypted
  // before ever touching the database.
  const [created] = await db
    .insert(toolServersTable)
    .values({
      productId,
      label: typeof body.label === "string" && body.label.trim() ? body.label : "Server",
      username: typeof body.username === "string" ? encryptToolField(body.username) : undefined,
      password: typeof body.password === "string" ? encryptToolField(body.password) : undefined,
      loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
      usernameField: typeof body.usernameField === "string" ? body.usernameField : undefined,
      passwordField: typeof body.passwordField === "string" ? body.passwordField : undefined,
      isAutoLogin: typeof body.isAutoLogin === "boolean" ? body.isAutoLogin : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    })
    .returning();

  res.status(201).json(maskServerCredentials(created));
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

  // GET /admin/products only ever shows masked username/password, so a
  // resubmitted masked placeholder (the admin never edited that field)
  // means "leave the stored credential alone" — never encrypt the mask
  // itself over the top of the real value.
  const rawUsername = typeof body.username === "string" ? body.username : undefined;
  const rawPassword = typeof body.password === "string" ? body.password : undefined;

  const fields = {
    label: typeof body.label === "string" ? body.label : undefined,
    username: rawUsername !== undefined && !isUnchangedMaskedValue(rawUsername) ? encryptToolField(rawUsername) : undefined,
    password: rawPassword !== undefined && !isUnchangedMaskedValue(rawPassword) ? encryptToolField(rawPassword) : undefined,
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

  res.json(maskServerCredentials(updated));
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

// ── Analytics / Integrations ──────────────────────────────────────────────────

router.get("/admin/integrations", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getIntegrationSettings();
  res.json(settings);
});

router.put("/admin/integrations/meta-pixel", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, pixelId } = req.body as { enabled?: boolean; pixelId?: string | null };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }
  const trimmed = typeof pixelId === "string" ? pixelId.trim() : null;
  if (enabled && trimmed && !/^\d+$/.test(trimmed)) {
    res.status(400).json({ error: "Pixel ID must be numeric (e.g. 1371893314574468)" });
    return;
  }
  await saveMetaPixelSettings({ enabled, pixelId: trimmed || null }, "admin");
  res.json({ ok: true });
});

router.put("/admin/integrations/meta-capi", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, accessToken, testEventCode, siteUrl } = req.body as {
    enabled?: boolean;
    accessToken?: string;
    testEventCode?: string | null;
    siteUrl?: string | null;
  };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }
  const trimmedUrl = typeof siteUrl === "string" ? siteUrl.trim().replace(/\/$/, "") : null;
  if (trimmedUrl && !/^https?:\/\/.+/.test(trimmedUrl)) {
    res.status(400).json({ error: "Site URL must be a valid URL starting with https://" });
    return;
  }
  await saveMetaCapiSettings(
    {
      enabled,
      ...(typeof accessToken === "string" ? { accessToken: accessToken.trim() } : {}),
      ...(typeof testEventCode !== "undefined" ? { testEventCode: typeof testEventCode === "string" ? testEventCode.trim() || null : null } : {}),
      ...(typeof siteUrl !== "undefined" ? { siteUrl: trimmedUrl || null } : {}),
    },
    "admin",
  );
  res.json({ ok: true });
});

router.put("/admin/integrations/google-tag-manager", requireAdmin, async (req, res): Promise<void> => {
  const { enabled, containerId } = req.body as { enabled?: boolean; containerId?: string | null };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }
  const trimmedId = typeof containerId === "string" ? containerId.trim().toUpperCase() : null;
  if (trimmedId && !/^GTM-[A-Z0-9]+$/.test(trimmedId)) {
    res.status(400).json({ error: "Container ID must start with GTM- (e.g. GTM-XXXXXXX)" });
    return;
  }
  await saveGtmSettings({ enabled, containerId: trimmedId || null }, "admin");
  res.json({ ok: true });
});

router.post("/admin/integrations/meta-capi/test", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getIntegrationSettings();
  if (!settings.metaCapi.enabled || !settings.metaCapi.pixelId || !settings.metaCapi.tokenConfigured || !settings.metaCapi.siteUrl) {
    res.status(400).json({
      ok: false,
      reason: "CAPI must be enabled with a Pixel ID, access token, and site URL configured before sending test events",
    });
    return;
  }
  const eventId = `test_pageview_${Date.now()}`;
  const sent = await sendCapiEvent({
    eventName: "PageView",
    eventId,
    reference: undefined,
    userData: {},
    customData: {},
  });
  if (sent) {
    res.json({ ok: true, eventId });
  } else {
    res.status(500).json({ ok: false, reason: "CAPI returned an error — check server logs" });
  }
});

router.get("/admin/analytics/events", requireAdmin, async (_req, res): Promise<void> => {
  const events = await db
    .select()
    .from(conversionEventsTable)
    .orderBy(desc(conversionEventsTable.createdAt))
    .limit(50);
  res.json(events);
});

export default router;
