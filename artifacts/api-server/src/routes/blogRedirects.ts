import { Router, type IRouter } from "express";
import { db, blogRedirectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";

const router: IRouter = Router();
router.use(attachStaffUser);

// Looked up by the store frontend when a /blog/:slug request 404s, so it can
// issue a client-side redirect to the new slug (search engines get a 301 via
// this same lookup used server-side would be ideal, but since routing lives
// in the SPA, the frontend performs `router.replace` — see BlogPost page).
router.get("/blog/redirects/:fromSlug", async (req, res): Promise<void> => {
  const [row] = await db.select().from(blogRedirectsTable).where(eq(blogRedirectsTable.fromSlug, req.params.fromSlug)).limit(1);
  if (!row) {
    res.status(404).json({ error: "No redirect" });
    return;
  }
  res.json({ toSlug: row.toSlug });
});

router.get("/admin/blog/redirects", requireStaffRole("administrator", "editor"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(blogRedirectsTable).orderBy(blogRedirectsTable.createdAt);
  res.json(rows);
});

router.post("/admin/blog/redirects", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const { fromSlug, toSlug } = req.body as { fromSlug?: string; toSlug?: string };
    if (!fromSlug?.trim() || !toSlug?.trim()) {
      res.status(400).json({ error: "fromSlug and toSlug are required." });
      return;
    }
    const [created] = await db.insert(blogRedirectsTable).values({ fromSlug: fromSlug.trim(), toSlug: toSlug.trim() }).returning();
    res.status(201).json(created);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A redirect from that slug already exists." });
      return;
    }
    logger.error({ err }, "Failed to create redirect");
    res.status(500).json({ error: "Failed to create redirect" });
  }
});

router.delete("/admin/blog/redirects/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  await db.delete(blogRedirectsTable).where(eq(blogRedirectsTable.id, parseInt(String(req.params.id), 10)));
  res.status(204).end();
});

export default router;
