import { Router, type IRouter } from "express";
import multer from "multer";
import { db, blogMediaTable, blogPostsTable, staffUsersTable } from "@workspace/db";
import { eq, desc, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";
import { processAndStoreBlogImage, ALLOWED_IMAGE_MIME_TYPES, MAX_BLOG_IMAGE_UPLOAD_BYTES, type BlogImageKind } from "../lib/blogImages";

const router: IRouter = Router();
router.use(attachStaffUser);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BLOG_IMAGE_UPLOAD_BYTES },
});

router.post(
  "/admin/blog/media/upload",
  requireStaffRole("administrator", "editor", "author"),
  upload.single("image"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No image file provided." });
        return;
      }
      if (!ALLOWED_IMAGE_MIME_TYPES.has(req.file.mimetype)) {
        res.status(400).json({
          error: `Unsupported image type "${req.file.mimetype}". Allowed: JPEG, PNG, WebP, GIF. Maximum upload size: ${Math.round(MAX_BLOG_IMAGE_UPLOAD_BYTES / (1024 * 1024))}MB.`,
        });
        return;
      }
      const kind = (req.body.kind as BlogImageKind) || "content";
      const processed = await processAndStoreBlogImage(req.file.buffer, req.file.originalname, kind);

      const [media] = await db
        .insert(blogMediaTable)
        .values({
          url: processed.url,
          originalFilename: processed.originalFilename,
          altText: (req.body.altText as string) || null,
          caption: (req.body.caption as string) || null,
          width: processed.width,
          height: processed.height,
          fileSizeBytes: processed.fileSizeBytes,
          mimeType: processed.mimeType,
          uploadedBy: req.staffUser!.id,
        })
        .returning();
      res.status(201).json(media);
    } catch (err) {
      logger.error({ err }, "Blog image upload/optimisation failed");
      res.status(500).json({ error: err instanceof Error ? err.message : "Image upload failed" });
    }
  },
);

router.get("/admin/blog/media", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  try {
    const q = req.query.q ? String(req.query.q).toLowerCase() : undefined;
    const rows = await db
      .select()
      .from(blogMediaTable)
      .where(q ? or(sql`lower(${blogMediaTable.originalFilename}) like ${"%" + q + "%"}`, sql`lower(${blogMediaTable.altText}) like ${"%" + q + "%"}`) : undefined)
      .orderBy(desc(blogMediaTable.createdAt));

    // Determine which media URLs are currently referenced by a post (featured
    // image or embedded in content), so the UI can warn before deletion.
    const posts = await db.select({ id: blogPostsTable.id, title: blogPostsTable.title, content: blogPostsTable.content, featuredImageUrl: blogPostsTable.featuredImageUrl }).from(blogPostsTable);
    const usage = rows.map((m) => {
      const usedIn = posts.filter((p) => p.featuredImageUrl === m.url || (p.content && p.content.includes(m.url)));
      return { ...m, usedInPosts: usedIn.map((p) => ({ id: p.id, title: p.title })) };
    });
    res.json(usage);
  } catch (err) {
    logger.error({ err }, "Failed to load media library");
    res.status(500).json({ error: "Failed to load media library" });
  }
});

router.put("/admin/blog/media/:id", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { altText, caption } = req.body as { altText?: string; caption?: string };
  const [updated] = await db
    .update(blogMediaTable)
    .set({ altText: altText ?? null, caption: caption ?? null })
    .where(eq(blogMediaTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/blog/media/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [media] = await db.select().from(blogMediaTable).where(eq(blogMediaTable.id, id)).limit(1);
  if (!media) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const posts = await db.select({ id: blogPostsTable.id, content: blogPostsTable.content, featuredImageUrl: blogPostsTable.featuredImageUrl }).from(blogPostsTable);
  const inUse = posts.some((p) => p.featuredImageUrl === media.url || (p.content && p.content.includes(media.url)));
  if (inUse && req.query.force !== "true") {
    res.status(409).json({ error: "This image is used in at least one post. Pass force=true to delete anyway." });
    return;
  }
  await db.delete(blogMediaTable).where(eq(blogMediaTable.id, id));
  res.status(204).end();
});

export default router;
