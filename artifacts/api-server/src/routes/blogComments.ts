import { Router, type IRouter } from "express";
import { db, blogCommentsTable, blogPostsTable, blogSettingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";

const router: IRouter = Router();
router.use(attachStaffUser);

router.get("/blog/posts/:slug/comments", async (req, res): Promise<void> => {
  const [post] = await db.select({ id: blogPostsTable.id }).from(blogPostsTable).where(eq(blogPostsTable.slug, req.params.slug)).limit(1);
  if (!post) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(blogCommentsTable)
    .where(and(eq(blogCommentsTable.postId, post.id), eq(blogCommentsTable.status, "approved")))
    .orderBy(desc(blogCommentsTable.createdAt));
  res.json(rows);
});

router.post("/blog/posts/:slug/comments", async (req, res): Promise<void> => {
  try {
    const [settings] = await db.select().from(blogSettingsTable).limit(1);
    if (settings && !settings.commentsEnabledGlobally) {
      res.status(403).json({ error: "Comments are currently disabled." });
      return;
    }
    const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.slug, req.params.slug)).limit(1);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    if (!post.allowComments) {
      res.status(403).json({ error: "Comments are disabled for this post." });
      return;
    }
    const { authorName, authorEmail, content, parentId } = req.body as {
      authorName?: string;
      authorEmail?: string;
      content?: string;
      parentId?: number;
    };
    if (!authorName?.trim() || !authorEmail?.trim() || !content?.trim()) {
      res.status(400).json({ error: "Name, email and comment content are required." });
      return;
    }
    const [created] = await db
      .insert(blogCommentsTable)
      .values({
        postId: post.id,
        authorName: authorName.trim(),
        authorEmail: authorEmail.trim(),
        content: content.trim(),
        status: "pending",
        parentId: typeof parentId === "number" ? parentId : null,
      })
      .returning();
    res.status(201).json({ message: "Comment submitted and awaiting moderation.", comment: created });
  } catch (err) {
    logger.error({ err }, "Failed to submit comment");
    res.status(500).json({ error: "Failed to submit comment" });
  }
});

router.get("/admin/blog/comments", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const rows = await db
    .select({
      id: blogCommentsTable.id,
      postId: blogCommentsTable.postId,
      authorName: blogCommentsTable.authorName,
      authorEmail: blogCommentsTable.authorEmail,
      content: blogCommentsTable.content,
      status: blogCommentsTable.status,
      parentId: blogCommentsTable.parentId,
      createdAt: blogCommentsTable.createdAt,
      postSlug: blogPostsTable.slug,
      postTitle: blogPostsTable.title,
    })
    .from(blogCommentsTable)
    .leftJoin(blogPostsTable, eq(blogCommentsTable.postId, blogPostsTable.id))
    .where(status ? eq(blogCommentsTable.status, status) : undefined)
    .orderBy(desc(blogCommentsTable.createdAt));
  res.json(rows);
});

router.put("/admin/blog/comments/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (!status || !["pending", "approved", "spam", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db.update(blogCommentsTable).set({ status }).where(eq(blogCommentsTable.id, parseInt(String(req.params.id), 10))).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/blog/comments/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  await db.delete(blogCommentsTable).where(eq(blogCommentsTable.id, parseInt(String(req.params.id), 10)));
  res.status(204).end();
});

export default router;
