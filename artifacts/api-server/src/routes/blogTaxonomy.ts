import { Router, type IRouter } from "express";
import { db, blogCategoriesTable, blogTagsTable, blogPostsTable, blogPostTagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { slugify } from "../lib/slugify";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";

const router: IRouter = Router();
router.use(attachStaffUser);

router.get("/blog/categories", async (_req, res): Promise<void> => {
  const rows = await db.select().from(blogCategoriesTable).orderBy(blogCategoriesTable.name);
  res.json(rows);
});

router.get("/blog/tags", async (_req, res): Promise<void> => {
  const rows = await db.select().from(blogTagsTable).orderBy(blogTagsTable.name);
  res.json(rows);
});

router.get("/admin/blog/categories", requireStaffRole("administrator", "editor", "author"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(blogCategoriesTable).orderBy(blogCategoriesTable.name);
  res.json(rows);
});

router.post("/admin/blog/categories", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    const slug = slugify(name);
    const [existing] = await db.select().from(blogCategoriesTable).where(eq(blogCategoriesTable.slug, slug)).limit(1);
    if (existing) {
      res.status(409).json({ error: "A category with that name/slug already exists." });
      return;
    }
    const [created] = await db.insert(blogCategoriesTable).values({ name: name.trim(), slug, description: description?.trim() || null }).returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.put("/admin/blog/categories/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const { name, description } = req.body as { name?: string; description?: string };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim();
      updates.slug = slugify(name);
    }
    if (typeof description === "string") updates.description = description.trim() || null;
    const [updated] = await db.update(blogCategoriesTable).set(updates as never).where(eq(blogCategoriesTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/admin/blog/categories/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  await db.update(blogPostsTable).set({ categoryId: null }).where(eq(blogPostsTable.categoryId, id));
  await db.delete(blogCategoriesTable).where(eq(blogCategoriesTable.id, id));
  res.status(204).end();
});

router.get("/admin/blog/tags", requireStaffRole("administrator", "editor", "author"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(blogTagsTable).orderBy(blogTagsTable.name);
  res.json(rows);
});

router.post("/admin/blog/tags", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "Name is required." });
      return;
    }
    const slug = slugify(name);
    const [existing] = await db.select().from(blogTagsTable).where(eq(blogTagsTable.slug, slug)).limit(1);
    if (existing) {
      res.status(200).json(existing); // reuse existing tag rather than erroring, editors add tags inline often
      return;
    }
    const [created] = await db.insert(blogTagsTable).values({ name: name.trim(), slug }).returning();
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create tag");
    res.status(500).json({ error: "Failed to create tag" });
  }
});

router.delete("/admin/blog/tags/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  await db.delete(blogPostTagsTable).where(eq(blogPostTagsTable.tagId, id));
  await db.delete(blogTagsTable).where(eq(blogTagsTable.id, id));
  res.status(204).end();
});

export default router;
