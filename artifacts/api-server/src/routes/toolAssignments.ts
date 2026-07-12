import { Router, type IRouter, type RequestHandler, type Request, type Response } from "express";
import {
  db,
  toolAssignmentsTable,
  toolEntitlementsTable,
  productsTable,
  toolServersTable,
  reviewPromptsTable,
  reviewsTable,
  testimonialsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, isNull, ne, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { pickDefaultServerForProduct } from "../lib/toolAccess";

const router: IRouter = Router();

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

const VALID_SOURCES = ["purchase", "renewal", "manual_assignment", "complimentary", "promotional", "admin_correction"];
const VALID_STATUSES = ["active", "revoked", "expired"];

function isAssignmentActive(a: typeof toolAssignmentsTable.$inferSelect): boolean {
  if (a.status !== "active") return false;
  if (a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
  return true;
}

async function createOrUpdateEntitlementForAssignment(assignment: typeof toolAssignmentsTable.$inferSelect, serverId?: number | null) {
  const [existing] = await db
    .select()
    .from(toolEntitlementsTable)
    .where(eq(toolEntitlementsTable.assignmentId, assignment.id));

  const assignedServerId =
    serverId !== undefined && serverId !== null ? serverId : await pickDefaultServerForProduct(assignment.productId);

  const expiresAt = assignment.expiresAt ? new Date(assignment.expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const reference = `ASSIGNMENT-${assignment.id}`;

  if (existing) {
    await db
      .update(toolEntitlementsTable)
      .set({
        status: isAssignmentActive(assignment) ? "active" : "revoked",
        serverId: assignedServerId,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(toolEntitlementsTable.id, existing.id));
    return existing.id;
  }

  if (isAssignmentActive(assignment)) {
    const [created] = await db
      .insert(toolEntitlementsTable)
      .values({
        clerkUserId: assignment.clerkUserId,
        productId: assignment.productId,
        serverId: assignedServerId,
        assignmentId: assignment.id,
        reference,
        status: "active",
        expiresAt,
      })
      .returning();
    return created.id;
  }

  return null;
}

async function createReviewPromptForAssignment(assignment: typeof toolAssignmentsTable.$inferSelect) {
  if (!assignment.reviewInvitationEnabled || !isAssignmentActive(assignment)) return;

  const existing = await db
    .select()
    .from(reviewPromptsTable)
    .where(
      and(
        eq(reviewPromptsTable.clerkUserId, assignment.clerkUserId),
        eq(reviewPromptsTable.assignmentId, assignment.id),
        eq(reviewPromptsTable.productId, assignment.productId),
      ),
    );

  if (existing.length === 0) {
    await db.insert(reviewPromptsTable).values({
      clerkUserId: assignment.clerkUserId,
      assignmentId: assignment.id,
      productId: assignment.productId,
      source: "assignment",
    });
  }
}

async function resetReviewPromptForAssignment(assignmentId: number) {
  await db
    .update(reviewPromptsTable)
    .set({ promptCount: 0, reviewedAt: null, dismissedAt: null, lastPromptedAt: null })
    .where(eq(reviewPromptsTable.assignmentId, assignmentId));
}

router.get("/admin/tool-assignments", requireAdmin, async (req, res): Promise<void> => {
  const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : undefined;
  const productId = typeof req.query.productId === "string" ? parseInt(req.query.productId, 10) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const source = typeof req.query.source === "string" ? req.query.source : undefined;

  const where = [
    userId ? eq(toolAssignmentsTable.clerkUserId, userId) : undefined,
    productId && !isNaN(productId) ? eq(toolAssignmentsTable.productId, productId) : undefined,
    status && VALID_STATUSES.includes(status) ? eq(toolAssignmentsTable.status, status) : undefined,
    source && VALID_SOURCES.includes(source) ? eq(toolAssignmentsTable.source, source) : undefined,
  ].filter(Boolean);

  const assignments = await db
    .select()
    .from(toolAssignmentsTable)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(toolAssignmentsTable.createdAt));

  const productIds = Array.from(new Set(assignments.map((a) => a.productId)));
  const products = productIds.length
    ? await db.select().from(productsTable).where(inArray(productsTable.id, productIds))
    : [];
  const productNameById = Object.fromEntries(products.map((p) => [p.id, p.name]));

  const assignmentIds = assignments.map((a) => a.id);
  const entitlements = assignmentIds.length
    ? await db.select().from(toolEntitlementsTable).where(inArray(toolEntitlementsTable.assignmentId, assignmentIds))
    : [];
  const entitlementByAssignmentId = Object.fromEntries(entitlements.map((e) => [e.assignmentId, e]));

  res.json(
    assignments.map((a) => ({
      ...a,
      productName: productNameById[a.productId] ?? "Unknown",
      entitlement: entitlementByAssignmentId[a.id] ?? null,
      isActive: isAssignmentActive(a),
    })),
  );
});

router.post("/admin/tool-assignments", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    clerkUserId?: unknown;
    productId?: unknown;
    serverId?: unknown;
    source?: unknown;
    reason?: unknown;
    reviewInvitationEnabled?: unknown;
    testimonialInvitationEnabled?: unknown;
    startsAt?: unknown;
    expiresAt?: unknown;
  };

  const clerkUserId = typeof body.clerkUserId === "string" ? body.clerkUserId.trim() : "";
  const productId = typeof body.productId === "number" ? body.productId : parseInt(String(body.productId), 10);
  const serverId = typeof body.serverId === "number" ? body.serverId : body.serverId === null ? null : undefined;
  const source = typeof body.source === "string" ? body.source : "manual_assignment";
  const reason = typeof body.reason === "string" ? body.reason.trim() : null;
  const reviewInvitationEnabled = body.reviewInvitationEnabled !== false;
  const testimonialInvitationEnabled = body.testimonialInvitationEnabled === true;
  const startsAt = typeof body.startsAt === "string" && body.startsAt ? new Date(body.startsAt) : new Date();
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt ? new Date(body.expiresAt) : null;

  if (!clerkUserId || !Number.isInteger(productId)) {
    res.status(400).json({ error: "clerkUserId and productId are required" });
    return;
  }
  if (!VALID_SOURCES.includes(source)) {
    res.status(400).json({ error: "Invalid source" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  if (serverId !== undefined && serverId !== null) {
    const [server] = await db.select().from(toolServersTable).where(eq(toolServersTable.id, serverId));
    if (!server || server.productId !== productId) {
      res.status(400).json({ error: "serverId does not belong to this product" });
      return;
    }
  }

  const [assignment] = await db
    .insert(toolAssignmentsTable)
    .values({
      clerkUserId,
      productId,
      adminUsername: process.env.ADMIN_USERNAME ?? "admin",
      source,
      reason,
      reviewInvitationEnabled,
      testimonialInvitationEnabled,
      startsAt,
      expiresAt,
    })
    .returning();

  await createOrUpdateEntitlementForAssignment(assignment, serverId);
  await createReviewPromptForAssignment(assignment);

  logger.info({ assignmentId: assignment.id, clerkUserId, productId }, "Tool assignment created by admin");
  res.status(201).json(assignment);
});

router.put("/admin/tool-assignments/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [assignment] = await db.select().from(toolAssignmentsTable).where(eq(toolAssignmentsTable.id, id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const body = req.body as {
    status?: unknown;
    source?: unknown;
    reason?: unknown;
    reviewInvitationEnabled?: unknown;
    testimonialInvitationEnabled?: unknown;
    serverId?: unknown;
    expiresAt?: unknown;
  };

  const serverId = typeof body.serverId === "number" ? body.serverId : undefined;
  if (serverId !== undefined && serverId !== null) {
    const [server] = await db.select().from(toolServersTable).where(eq(toolServersTable.id, serverId));
    if (!server || server.productId !== assignment.productId) {
      res.status(400).json({ error: "serverId does not belong to this product" });
      return;
    }
  }

  const updates: Partial<typeof toolAssignmentsTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) updates.status = body.status;
  if (typeof body.source === "string" && VALID_SOURCES.includes(body.source)) updates.source = body.source;
  if (typeof body.reason === "string") updates.reason = body.reason.trim() || null;
  if (typeof body.reviewInvitationEnabled === "boolean") updates.reviewInvitationEnabled = body.reviewInvitationEnabled;
  if (typeof body.testimonialInvitationEnabled === "boolean") updates.testimonialInvitationEnabled = body.testimonialInvitationEnabled;
  if (typeof body.expiresAt === "string" && body.expiresAt) updates.expiresAt = new Date(body.expiresAt);
  if (body.expiresAt === null) updates.expiresAt = null;

  if (Object.keys(updates).length === 1 && serverId === undefined) {
    res.status(400).json({ error: "No valid fields" });
    return;
  }

  const [updated] = Object.keys(updates).length > 1
    ? await db.update(toolAssignmentsTable).set(updates).where(eq(toolAssignmentsTable.id, id)).returning()
    : [assignment];

  await createOrUpdateEntitlementForAssignment(updated, serverId);

  // If reactivating an assignment, reset its review prompt so the customer can be asked again.
  if (updates.status === "active" && assignment.status !== "active") {
    await resetReviewPromptForAssignment(updated.id);
  }
  await createReviewPromptForAssignment(updated);

  logger.info({ assignmentId: id }, "Tool assignment updated by admin");
  res.json(updated);
});

router.delete("/admin/tool-assignments/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [assignment] = await db.select().from(toolAssignmentsTable).where(eq(toolAssignmentsTable.id, id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const [updated] = await db
    .update(toolAssignmentsTable)
    .set({ status: "revoked", revokedAt: new Date(), revokedBy: process.env.ADMIN_USERNAME ?? "admin", updatedAt: new Date() })
    .where(eq(toolAssignmentsTable.id, id))
    .returning();

  await createOrUpdateEntitlementForAssignment(updated);

  logger.info({ assignmentId: id }, "Tool assignment revoked by admin");
  res.json(updated);
});

router.get("/admin/tool-assignments/:id/reviews", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db.select().from(reviewsTable).where(eq(reviewsTable.assignmentId, id)).orderBy(desc(reviewsTable.createdAt));
  res.json(rows);
});

router.get("/admin/tool-assignments/:id/testimonials", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const rows = await db.select().from(testimonialsTable).where(eq(testimonialsTable.assignmentId, id)).orderBy(desc(testimonialsTable.createdAt));
  res.json(rows);
});

export default router;
