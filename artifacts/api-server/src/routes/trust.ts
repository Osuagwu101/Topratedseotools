import { Router, type IRouter, type RequestHandler, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getAuth } from "@clerk/express";
import {
  db,
  siteSettingsTable,
  testimonialsTable,
  reviewsTable,
  reviewPromptsTable,
  paymentMethodsTable,
  customerCounterAuditTable,
  ordersTable,
  productsTable,
} from "@workspace/db";
import { eq, and, desc, asc, ne, sql, count, isNull, gte, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";

const router: IRouter = Router();

const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: PNG, JPG, JPEG, WebP, SVG"));
    }
  },
});

const requireAdmin: RequestHandler = (req, res, next) => {
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

function getCurrentUserId(req: Request): string | null {
  const auth = getAuth(req);
  return (auth?.sessionClaims?.userId as string | undefined) || auth?.userId || null;
}

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { userId?: string }).userId = userId;
  next();
};

function firstPublicSearchPath(): string {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = pathsStr.split(",").map((p) => p.trim()).filter(Boolean)[0];
  if (!first) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set.");
  return first;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3) throw new Error("Invalid object storage path.");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function processAndStoreIcon(buffer: Buffer, mimetype: string, folder: string): Promise<string> {
  let processed = buffer;
  if (mimetype !== "image/svg+xml") {
    processed = await sharp(buffer)
      .resize(80, 80, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  }
  const ext = mimetype === "image/svg+xml" ? "svg" : "webp";
  const relativePath = `${folder}/icon-${randomUUID()}.${ext}`;
  const fullPath = `${firstPublicSearchPath()}/${relativePath}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(processed, {
    contentType: mimetype === "image/svg+xml" ? "image/svg+xml" : "image/webp",
    metadata: { cacheControl: "public, max-age=86400" },
  });
  return `/api/storage/public-objects/${relativePath}`;
}

async function ensureSettings() {
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const newRows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    return newRows[0];
  }
  return rows[0];
}

async function computeLiveCustomersServed(): Promise<{ liveCount: number; countingMethod: string }> {
  const settings = await ensureSettings();
  const countingMethod = settings.customersServedCountingMethod;
  if (countingMethod === "orders") {
    const [result] = await db
      .select({ count: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.status, "success"), eq(ordersTable.settlementStatus, "valid")));
    return { liveCount: result?.count ?? 0, countingMethod };
  }
  const rows = await db
    .select({ clerkUserId: ordersTable.clerkUserId })
    .from(ordersTable)
    .where(and(eq(ordersTable.status, "success"), eq(ordersTable.settlementStatus, "valid"), ne(ordersTable.clerkUserId, "")))
    .groupBy(ordersTable.clerkUserId);
  return { liveCount: rows.length, countingMethod };
}

async function getDisplayedCustomersServed(): Promise<number> {
  const settings = await ensureSettings();
  const { liveCount } = await computeLiveCustomersServed();
  return settings.customersServedBaseline + settings.customersServedManualCorrection + liveCount;
}

// ── Testimonials (admin) ─────────────────────────────────────────────────────

router.get("/admin/testimonials", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(testimonialsTable).orderBy(asc(testimonialsTable.sortOrder), desc(testimonialsTable.createdAt));
  res.json(rows);
});

router.post("/admin/testimonials", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    displayName?: unknown;
    jobTitle?: unknown;
    text?: unknown;
    rating?: unknown;
    published?: unknown;
    isSample?: unknown;
    permissionObtained?: unknown;
  };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!displayName || !text) {
    res.status(400).json({ error: "displayName and text are required" });
    return;
  }
  const rating = typeof body.rating === "number" ? Math.min(5, Math.max(1, Math.round(body.rating))) : null;
  const [max] = await db.select({ max: sql<number>`coalesce(max(sort_order), 0)` }).from(testimonialsTable);
  const [created] = await db
    .insert(testimonialsTable)
    .values({
      displayName,
      jobTitle: typeof body.jobTitle === "string" ? body.jobTitle.trim() || null : null,
      text,
      rating,
      published: body.published === true,
      isSample: body.isSample === true,
      permissionObtained: body.permissionObtained === true,
      sortOrder: (max?.max ?? 0) + 1,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/admin/testimonials/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Partial<Record<string, unknown>> = { updatedAt: new Date() };
  if (typeof body.displayName === "string") updates.displayName = body.displayName.trim();
  if (typeof body.jobTitle === "string") updates.jobTitle = body.jobTitle.trim() || null;
  if (typeof body.text === "string") updates.text = body.text.trim();
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl;
  if (typeof body.rating === "number") updates.rating = Math.min(5, Math.max(1, Math.round(body.rating)));
  if (typeof body.published === "boolean") updates.published = body.published;
  if (typeof body.isSample === "boolean") updates.isSample = body.isSample;
  if (typeof body.permissionObtained === "boolean") updates.permissionObtained = body.permissionObtained;
  if (typeof body.sortOrder === "number") updates.sortOrder = Math.round(body.sortOrder);
  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "No valid fields" });
    return;
  }
  const [updated] = await db.update(testimonialsTable).set(updates).where(eq(testimonialsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Testimonial not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/testimonials/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(testimonialsTable).where(eq(testimonialsTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/testimonials/reorder", requireAdmin, async (req, res): Promise<void> => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v: unknown) => (typeof v === "number" ? v : parseInt(String(v), 10))).filter((v: number) => Number.isInteger(v)) : [];
  for (let i = 0; i < ids.length; i++) {
    await db.update(testimonialsTable).set({ sortOrder: i + 1 }).where(eq(testimonialsTable.id, ids[i]));
  }
  res.json({ ok: true });
});

router.post("/admin/testimonials/:id/avatar", requireAdmin, iconUpload.single("avatar"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    const url = await processAndStoreIcon(req.file.buffer, req.file.mimetype, "testimonials");
    const [updated] = await db.update(testimonialsTable).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(testimonialsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Testimonial not found" });
      return;
    }
    res.json({ avatarUrl: url });
  } catch (err) {
    logger.error({ err }, "Failed to upload testimonial avatar");
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

router.delete("/admin/testimonials/:id/avatar", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.update(testimonialsTable).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(testimonialsTable.id, id));
  res.json({ ok: true });
});

// ── Testimonials (public) ────────────────────────────────────────────────────

router.get("/testimonials", async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  if (!settings.testimonialsEnabled) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(testimonialsTable)
    .where(eq(testimonialsTable.published, true))
    .orderBy(asc(testimonialsTable.sortOrder), desc(testimonialsTable.createdAt));
  res.json(rows);
});

// ── Reviews (admin) ──────────────────────────────────────────────────────────

router.get("/admin/reviews", requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const productId = typeof req.query.productId === "string" ? parseInt(req.query.productId, 10) : undefined;
  const rating = typeof req.query.rating === "string" ? parseInt(req.query.rating, 10) : undefined;
  const where = [
    statusFilter ? eq(reviewsTable.status, statusFilter) : undefined,
    productId && !isNaN(productId) ? eq(reviewsTable.productId, productId) : undefined,
    rating && !isNaN(rating) ? eq(reviewsTable.rating, rating) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(reviewsTable)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(reviewsTable.createdAt));

  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productNameById = Object.fromEntries(products.map((p) => [p.id, p.name]));

  res.json(rows.map((r) => ({ ...r, productName: productNameById[r.productId] ?? "Unknown" })));
});

router.put("/admin/reviews/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!["pending", "approved", "rejected", "hidden"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db.update(reviewsTable).set({ status, updatedAt: new Date() }).where(eq(reviewsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  res.json(updated);
});

router.put("/admin/reviews/:id/reply", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const reply = typeof req.body?.reply === "string" ? req.body.reply.trim() : "";
  if (!reply) {
    res.status(400).json({ error: "Reply text is required" });
    return;
  }
  const [updated] = await db
    .update(reviewsTable)
    .set({ adminReply: reply, adminReplyAt: new Date(), updatedAt: new Date() })
    .where(eq(reviewsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/reviews/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(reviewsTable).where(eq(reviewsTable.id, id));
  res.json({ ok: true });
});

// ── Reviews (public) ─────────────────────────────────────────────────────────

router.get("/reviews", async (req, res): Promise<void> => {
  const productId = typeof req.query.productId === "string" ? parseInt(req.query.productId, 10) : undefined;
  const where = [eq(reviewsTable.status, "approved")];
  if (productId && !isNaN(productId)) where.push(eq(reviewsTable.productId, productId));
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(and(...where))
    .orderBy(desc(reviewsTable.createdAt));
  res.json(rows);
});

router.get("/reviews/summary", async (req, res): Promise<void> => {
  const productId = typeof req.query.productId === "string" ? parseInt(req.query.productId, 10) : undefined;
  const where = [eq(reviewsTable.status, "approved")];
  if (productId && !isNaN(productId)) where.push(eq(reviewsTable.productId, productId));
  const rows = await db
    .select({ rating: reviewsTable.rating, count: count() })
    .from(reviewsTable)
    .where(and(...where))
    .groupBy(reviewsTable.rating);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const average = total > 0 ? rows.reduce((sum, r) => sum + r.rating * r.count, 0) / total : 0;
  res.json({ average: Math.round(average * 10) / 10, total, breakdown: rows });
});

// ── Reviews (user) ───────────────────────────────────────────────────────────

router.get("/users/me/review-prompts", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Ensure prompt records exist for every eligible success order product
  const eligibleOrders = await db
    .select({
      orderId: ordersTable.id,
      productId: ordersTable.productId,
      reference: ordersTable.reference,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.clerkUserId, userId),
        eq(ordersTable.status, "success"),
        eq(ordersTable.settlementStatus, "valid"),
      ),
    );

  for (const order of eligibleOrders) {
    const existing = await db
      .select()
      .from(reviewPromptsTable)
      .where(
        and(
          eq(reviewPromptsTable.clerkUserId, userId),
          eq(reviewPromptsTable.orderId, order.orderId),
          eq(reviewPromptsTable.productId, order.productId),
        ),
      );
    if (existing.length === 0) {
      await db.insert(reviewPromptsTable).values({
        clerkUserId: userId,
        orderId: order.orderId,
        productId: order.productId,
      });
    }
  }

  // Return prompts that still need a review and have been shown fewer than 3 times
  const prompts = await db
    .select({
      id: reviewPromptsTable.id,
      orderId: reviewPromptsTable.orderId,
      productId: reviewPromptsTable.productId,
      promptCount: reviewPromptsTable.promptCount,
      reviewedAt: reviewPromptsTable.reviewedAt,
    })
    .from(reviewPromptsTable)
    .where(
      and(
        eq(reviewPromptsTable.clerkUserId, userId),
        isNull(reviewPromptsTable.reviewedAt),
        ne(reviewPromptsTable.promptCount, 3),
      ),
    );

  const productIds = Array.from(new Set(prompts.map((p) => p.productId)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productNameById = Object.fromEntries(products.map((p) => [p.id, p.name]));

  res.json(
    prompts.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      productId: p.productId,
      productName: productNameById[p.productId] ?? "Unknown",
      promptCount: p.promptCount,
    })),
  );
});

router.post("/users/me/review-prompts/:id/shown", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [prompt] = await db
    .select()
    .from(reviewPromptsTable)
    .where(and(eq(reviewPromptsTable.id, id), eq(reviewPromptsTable.clerkUserId, userId)));
  if (!prompt) {
    res.status(404).json({ error: "Prompt not found" });
    return;
  }
  const newCount = Math.min(3, prompt.promptCount + 1);
  await db
    .update(reviewPromptsTable)
    .set({ promptCount: newCount, lastPromptedAt: new Date() })
    .where(eq(reviewPromptsTable.id, id));
  res.json({ ok: true, promptCount: newCount });
});

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = req.body as {
    orderId?: unknown;
    productId?: unknown;
    rating?: unknown;
    title?: unknown;
    text?: unknown;
  };
  const orderId = typeof body.orderId === "number" ? body.orderId : parseInt(String(body.orderId), 10);
  const productId = typeof body.productId === "number" ? body.productId : parseInt(String(body.productId), 10);
  const rating = typeof body.rating === "number" ? Math.min(5, Math.max(1, Math.round(body.rating))) : NaN;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!Number.isInteger(orderId) || !Number.isInteger(productId) || !Number.isInteger(rating) || !text) {
    res.status(400).json({ error: "orderId, productId, rating (1-5), and text are required" });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || order.clerkUserId !== userId || order.productId !== productId || order.status !== "success" || order.settlementStatus !== "valid") {
    res.status(403).json({ error: "You can only review products from completed, valid purchases." });
    return;
  }

  const existing = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.clerkUserId, userId), eq(reviewsTable.orderId, orderId), eq(reviewsTable.productId, productId)));
  if (existing.length > 0) {
    res.status(409).json({ error: "You have already reviewed this purchase." });
    return;
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({
      clerkUserId: userId,
      orderId,
      productId,
      rating,
      title: typeof body.title === "string" ? body.title.trim() || null : null,
      text,
      status: "pending",
      verified: true,
    })
    .returning();

  await db
    .update(reviewPromptsTable)
    .set({ reviewedAt: new Date() })
    .where(and(eq(reviewPromptsTable.clerkUserId, userId), eq(reviewPromptsTable.orderId, orderId), eq(reviewPromptsTable.productId, productId)));

  res.status(201).json(review);
});

// ── Customers Served Counter ───────────────────────────────────────────────────

router.get("/admin/customers-served", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  const { liveCount, countingMethod } = await computeLiveCustomersServed();
  const displayedTotal = settings.customersServedBaseline + settings.customersServedManualCorrection + liveCount;
  const audits = await db.select().from(customerCounterAuditTable).orderBy(desc(customerCounterAuditTable.createdAt)).limit(50);
  res.json({
    baseline: settings.customersServedBaseline,
    manualCorrection: settings.customersServedManualCorrection,
    liveCount,
    displayedTotal,
    countingMethod,
    lastUpdatedAt: settings.updatedAt,
    audits,
  });
});

router.put("/admin/customers-served", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    baseline?: unknown;
    countingMethod?: unknown;
    manualCorrection?: unknown;
    reason?: unknown;
  };
  const settings = await ensureSettings();
  const updates: Partial<typeof siteSettingsTable.$inferInsert> = { updatedAt: new Date(), updatedBy: "admin" };
  let newBaseline = settings.customersServedBaseline;
  let newCorrection = settings.customersServedManualCorrection;
  let newMethod = settings.customersServedCountingMethod;

  if (typeof body.baseline === "number") {
    if (!Number.isInteger(body.baseline) || body.baseline < 0) {
      res.status(400).json({ error: "Baseline must be a positive whole number." });
      return;
    }
    newBaseline = body.baseline;
    updates.customersServedBaseline = body.baseline;
  }
  if (typeof body.manualCorrection === "number") {
    if (!Number.isInteger(body.manualCorrection)) {
      res.status(400).json({ error: "Manual correction must be a whole number." });
      return;
    }
    newCorrection = body.manualCorrection;
    updates.customersServedManualCorrection = body.manualCorrection;
  }
  if (typeof body.countingMethod === "string") {
    if (!["unique_customers", "orders"].includes(body.countingMethod)) {
      res.status(400).json({ error: "Invalid counting method." });
      return;
    }
    newMethod = body.countingMethod;
    updates.customersServedCountingMethod = body.countingMethod;
  }
  if (Object.keys(updates).length === 2) {
    res.status(400).json({ error: "No valid fields" });
    return;
  }

  const { liveCount } = await computeLiveCustomersServed();
  const previousTotal = settings.customersServedBaseline + settings.customersServedManualCorrection + liveCount;
  await db.update(siteSettingsTable).set(updates).where(eq(siteSettingsTable.id, 1));
  const newDisplayedTotal = newBaseline + newCorrection + liveCount;
  if (previousTotal !== newDisplayedTotal || body.reason) {
    await db.insert(customerCounterAuditTable).values({
      previousTotal,
      newTotal: newDisplayedTotal,
      reason: typeof body.reason === "string" ? body.reason.trim() : "Manual correction",
      correctedBy: "admin",
    });
  }
  res.json({ baseline: newBaseline, manualCorrection: newCorrection, liveCount, countingMethod: newMethod, displayedTotal: newDisplayedTotal });
});

router.get("/customers-served", async (_req, res): Promise<void> => {
  const total = await getDisplayedCustomersServed();
  res.json({ total });
});

// ── Payment Methods (admin) ──────────────────────────────────────────────────

router.get("/admin/payment-methods", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(paymentMethodsTable).orderBy(asc(paymentMethodsTable.sortOrder), asc(paymentMethodsTable.name));
  res.json(rows);
});

router.post("/admin/payment-methods", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    name?: unknown;
    code?: unknown;
    altText?: unknown;
    iconUrl?: unknown;
    enabled?: unknown;
    provider?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  if (!name || !code) {
    res.status(400).json({ error: "name and code are required" });
    return;
  }
  const [max] = await db.select({ max: sql<number>`coalesce(max(sort_order), 0)` }).from(paymentMethodsTable);
  const [created] = await db
    .insert(paymentMethodsTable)
    .values({
      name,
      code,
      altText: typeof body.altText === "string" ? body.altText.trim() || null : null,
      iconUrl: typeof body.iconUrl === "string" ? body.iconUrl.trim() || null : null,
      enabled: body.enabled !== false,
      provider: typeof body.provider === "string" ? body.provider.trim() : "paystack",
      sortOrder: (max?.max ?? 0) + 1,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/admin/payment-methods/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updates: Partial<Record<string, unknown>> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.code === "string") updates.code = body.code.trim().toLowerCase();
  if (typeof body.altText === "string" || body.altText === null) updates.altText = body.altText;
  if (typeof body.iconUrl === "string" || body.iconUrl === null) updates.iconUrl = body.iconUrl;
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.provider === "string") updates.provider = body.provider.trim();
  if (typeof body.sortOrder === "number") updates.sortOrder = Math.round(body.sortOrder);
  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "No valid fields" });
    return;
  }
  const [updated] = await db.update(paymentMethodsTable).set(updates).where(eq(paymentMethodsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Payment method not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/payment-methods/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/payment-methods/reorder", requireAdmin, async (req, res): Promise<void> => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v: unknown) => (typeof v === "number" ? v : parseInt(String(v), 10))).filter((v: number) => Number.isInteger(v)) : [];
  for (let i = 0; i < ids.length; i++) {
    await db.update(paymentMethodsTable).set({ sortOrder: i + 1 }).where(eq(paymentMethodsTable.id, ids[i]));
  }
  res.json({ ok: true });
});

router.post("/admin/payment-methods/:id/icon", requireAdmin, iconUpload.single("icon"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    const url = await processAndStoreIcon(req.file.buffer, req.file.mimetype, "payment-methods");
    const [updated] = await db.update(paymentMethodsTable).set({ iconUrl: url, updatedAt: new Date() }).where(eq(paymentMethodsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Payment method not found" });
      return;
    }
    res.json({ iconUrl: url });
  } catch (err) {
    logger.error({ err }, "Failed to upload payment method icon");
    res.status(500).json({ error: "Failed to upload icon" });
  }
});

router.delete("/admin/payment-methods/:id/icon", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.update(paymentMethodsTable).set({ iconUrl: null, updatedAt: new Date() }).where(eq(paymentMethodsTable.id, id));
  res.json({ ok: true });
});

// ── Payment Methods (public) ───────────────────────────────────────────────────

router.get("/payment-methods", async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  if (!settings.paymentIconsEnabled) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(paymentMethodsTable)
    .where(eq(paymentMethodsTable.enabled, true))
    .orderBy(asc(paymentMethodsTable.sortOrder), asc(paymentMethodsTable.name));
  res.json(rows);
});

export default router;
