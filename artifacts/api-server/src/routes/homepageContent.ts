import { Router, type IRouter, type RequestHandler } from "express";
import { db, benefitCardsTable, howItWorksStepsTable, faqItemsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireSuperAdmin } from "../lib/staffAuth";

const router: IRouter = Router();

// Shared Super Admin gate — see lib/staffAuth.ts.
const requireAdmin: RequestHandler = requireSuperAdmin;

// ── Generic CRUD helper for the three simple, sortable homepage-content tables ──
// (benefit cards, how-it-works steps, FAQ items) — same shape: question/title +
// description/answer, sortOrder, published.

function registerContentResource<
  T extends { id: number; sortOrder: number; published: boolean },
>(opts: {
  resource: string; // e.g. "benefit-cards"
  table: typeof benefitCardsTable | typeof howItWorksStepsTable | typeof faqItemsTable;
  requiredFields: string[]; // fields that must be non-empty strings
  allowedFields: string[]; // all editable string/text fields
}) {
  const { resource, table, requiredFields, allowedFields } = opts;

  router.get(`/${resource}`, async (_req, res): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(table)
        .where(eq(table.published, true))
        .orderBy(asc(table.sortOrder));
      res.json(rows);
    } catch (err) {
      logger.error({ err, resource }, "Failed to fetch homepage content");
      res.status(500).json({ error: `Failed to fetch ${resource}` });
    }
  });

  router.get(`/admin/${resource}`, requireAdmin, async (_req, res): Promise<void> => {
    try {
      const rows = await db.select().from(table).orderBy(asc(table.sortOrder));
      res.json(rows);
    } catch (err) {
      logger.error({ err, resource }, "Failed to fetch homepage content (admin)");
      res.status(500).json({ error: `Failed to fetch ${resource}` });
    }
  });

  router.post(`/admin/${resource}`, requireAdmin, async (req, res): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;
      for (const field of requiredFields) {
        if (typeof body[field] !== "string" || !body[field].trim()) {
          res.status(400).json({ error: `${field} is required.` });
          return;
        }
      }
      const values: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (typeof body[field] === "string") values[field] = body[field].trim();
      }
      if (typeof body.sortOrder === "number") {
        values.sortOrder = Math.round(body.sortOrder);
      } else {
        // New items append to the end by default instead of all tying at 0,
        // which would make ordering among newly-added items unpredictable.
        const existing = await db.select({ sortOrder: table.sortOrder }).from(table);
        const maxSortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);
        values.sortOrder = maxSortOrder + 1;
      }
      if (typeof body.published === "boolean") values.published = body.published;

      const [created] = await db.insert(table).values(values as never).returning();
      res.status(201).json(created);
    } catch (err) {
      logger.error({ err, resource }, "Failed to create homepage content item");
      res.status(500).json({ error: `Failed to create ${resource} item` });
    }
  });

  router.put(`/admin/${resource}/:id`, requireAdmin, async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (typeof body[field] === "string") updates[field] = body[field].trim();
      }
      if (typeof body.sortOrder === "number") updates.sortOrder = Math.round(body.sortOrder);
      if (typeof body.published === "boolean") updates.published = body.published;

      const [updated] = await db
        .update(table)
        .set(updates as never)
        .where(eq(table.id, id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err, resource }, "Failed to update homepage content item");
      res.status(500).json({ error: `Failed to update ${resource} item` });
    }
  });

  router.delete(`/admin/${resource}/:id`, requireAdmin, async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      await db.delete(table).where(eq(table.id, id));
      res.status(204).end();
    } catch (err) {
      logger.error({ err, resource }, "Failed to delete homepage content item");
      res.status(500).json({ error: `Failed to delete ${resource} item` });
    }
  });

  router.post(`/admin/${resource}/reorder`, requireAdmin, async (req, res): Promise<void> => {
    try {
      const { ids } = req.body as { ids?: unknown };
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "number")) {
        res.status(400).json({ error: "ids must be an array of numbers" });
        return;
      }
      await Promise.all(
        (ids as number[]).map((id, index) =>
          db.update(table).set({ sortOrder: index, updatedAt: new Date() } as never).where(eq(table.id, id)),
        ),
      );
      res.status(204).end();
    } catch (err) {
      logger.error({ err, resource }, "Failed to reorder homepage content");
      res.status(500).json({ error: `Failed to reorder ${resource}` });
    }
  });
}

registerContentResource({
  resource: "benefit-cards",
  table: benefitCardsTable,
  requiredFields: ["title", "description"],
  allowedFields: ["title", "description", "icon"],
});

registerContentResource({
  resource: "how-it-works-steps",
  table: howItWorksStepsTable,
  requiredFields: ["title", "description"],
  allowedFields: ["title", "description", "icon"],
});

registerContentResource({
  resource: "faq-items",
  table: faqItemsTable,
  requiredFields: ["question", "answer"],
  allowedFields: ["question", "answer"],
});

export default router;
