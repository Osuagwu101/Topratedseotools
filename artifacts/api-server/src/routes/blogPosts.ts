import { Router, type IRouter } from "express";
import {
  db,
  blogPostsTable,
  blogCategoriesTable,
  blogTagsTable,
  blogPostTagsTable,
  staffUsersTable,
  productsTable,
  type BlogPostStatus,
} from "@workspace/db";
import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { uniqueSlug, estimateReadingTimeMinutes } from "../lib/slugify";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";
import { sanitizeBlogContent } from "../lib/sanitizeBlogHtml";

const router: IRouter = Router();
router.use(attachStaffUser);

// Flips any scheduled posts whose time has arrived to published. Cheap enough
// to run on every public read; avoids needing a separate cron/worker.
async function publishDueScheduledPosts(): Promise<void> {
  await db
    .update(blogPostsTable)
    .set({ status: "published", updatedAt: new Date() })
    .where(and(eq(blogPostsTable.status, "scheduled"), lte(blogPostsTable.scheduledAt, new Date())));
}

async function attachTagIds(postIds: number[]): Promise<Map<number, number[]>> {
  if (postIds.length === 0) return new Map();
  const rows = await db.select().from(blogPostTagsTable).where(inArray(blogPostTagsTable.postId, postIds));
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.postId) ?? [];
    list.push(row.tagId);
    map.set(row.postId, list);
  }
  return map;
}

async function enrichPosts(posts: (typeof blogPostsTable.$inferSelect)[]) {
  if (posts.length === 0) return [];
  const tagMap = await attachTagIds(posts.map((p) => p.id));
  const authorIds = [...new Set(posts.map((p) => p.authorId).filter((x): x is number => !!x))];
  const categoryIds = [...new Set(posts.map((p) => p.categoryId).filter((x): x is number => !!x))];
  const [authors, categories, allTags] = await Promise.all([
    authorIds.length
      ? db
          .select({ id: staffUsersTable.id, name: staffUsersTable.name, authorSlug: staffUsersTable.authorSlug, avatarUrl: staffUsersTable.avatarUrl })
          .from(staffUsersTable)
          .where(inArray(staffUsersTable.id, authorIds))
      : Promise.resolve([]),
    categoryIds.length
      ? db.select().from(blogCategoriesTable).where(inArray(blogCategoriesTable.id, categoryIds))
      : Promise.resolve([]),
    db.select().from(blogTagsTable),
  ]);
  const authorById = new Map(authors.map((a) => [a.id, a]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const tagById = new Map(allTags.map((t) => [t.id, t]));

  return posts.map((post) => ({
    ...post,
    author: post.authorId ? authorById.get(post.authorId) ?? null : null,
    category: post.categoryId ? categoryById.get(post.categoryId) ?? null : null,
    tags: (tagMap.get(post.id) ?? []).map((id) => tagById.get(id)).filter(Boolean),
  }));
}

const PUBLIC_LIST_LIMIT_DEFAULT = 9;

// ── Public endpoints ─────────────────────────────────────────────────────────

router.get("/blog/posts", async (req, res): Promise<void> => {
  try {
    await publishDueScheduledPosts();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? PUBLIC_LIST_LIMIT_DEFAULT), 10) || PUBLIC_LIST_LIMIT_DEFAULT));
    const offset = (page - 1) * limit;

    const conditions = [eq(blogPostsTable.status, "published")];
    if (req.query.category) {
      const [cat] = await db.select().from(blogCategoriesTable).where(eq(blogCategoriesTable.slug, String(req.query.category))).limit(1);
      if (!cat) {
        res.json({ posts: [], total: 0, page, limit });
        return;
      }
      conditions.push(eq(blogPostsTable.categoryId, cat.id));
    }
    if (req.query.tag) {
      const [tag] = await db.select().from(blogTagsTable).where(eq(blogTagsTable.slug, String(req.query.tag))).limit(1);
      if (!tag) {
        res.json({ posts: [], total: 0, page, limit });
        return;
      }
      const postTagRows = await db.select().from(blogPostTagsTable).where(eq(blogPostTagsTable.tagId, tag.id));
      const ids = postTagRows.map((r) => r.postId);
      if (ids.length === 0) {
        res.json({ posts: [], total: 0, page, limit });
        return;
      }
      conditions.push(inArray(blogPostsTable.id, ids));
    }
    if (req.query.author) {
      const [author] = await db.select().from(staffUsersTable).where(eq(staffUsersTable.authorSlug, String(req.query.author))).limit(1);
      if (!author) {
        res.json({ posts: [], total: 0, page, limit });
        return;
      }
      conditions.push(eq(blogPostsTable.authorId, author.id));
    }
    if (req.query.featured === "true") {
      conditions.push(eq(blogPostsTable.isFeatured, true));
    }

    const whereClause = and(...conditions);
    const [rows, [{ count }]] = await Promise.all([
      db.select().from(blogPostsTable).where(whereClause).orderBy(desc(blogPostsTable.publishedAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(blogPostsTable).where(whereClause),
    ]);

    res.json({ posts: await enrichPosts(rows), total: count, page, limit });
  } catch (err) {
    logger.error({ err }, "Failed to list blog posts");
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.get("/blog/search", async (req, res): Promise<void> => {
  try {
    await publishDueScheduledPosts();
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ posts: [] });
      return;
    }
    const like = `%${q.toLowerCase()}%`;
    const rows = await db
      .select()
      .from(blogPostsTable)
      .where(
        and(
          eq(blogPostsTable.status, "published"),
          or(
            sql`lower(${blogPostsTable.title}) like ${like}`,
            sql`lower(${blogPostsTable.excerpt}) like ${like}`,
            sql`lower(${blogPostsTable.content}) like ${like}`,
          ),
        ),
      )
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(30);
    res.json({ posts: await enrichPosts(rows) });
  } catch (err) {
    logger.error({ err }, "Blog search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/blog/posts/:slug", async (req, res): Promise<void> => {
  try {
    await publishDueScheduledPosts();
    const [post] = await db
      .select()
      .from(blogPostsTable)
      .where(and(eq(blogPostsTable.slug, req.params.slug), eq(blogPostsTable.status, "published")))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await db.update(blogPostsTable).set({ viewCount: post.viewCount + 1 }).where(eq(blogPostsTable.id, post.id));

    let related: (typeof blogPostsTable.$inferSelect)[] = [];
    if (post.relatedPostIds.length > 0) {
      related = await db
        .select()
        .from(blogPostsTable)
        .where(and(inArray(blogPostsTable.id, post.relatedPostIds), eq(blogPostsTable.status, "published")));
    } else {
      const tagRows = await db.select().from(blogPostTagsTable).where(eq(blogPostTagsTable.postId, post.id));
      const tagIds = tagRows.map((r) => r.tagId);
      const matchConditions = [ne(blogPostsTable.id, post.id), eq(blogPostsTable.status, "published")];
      if (post.categoryId) {
        related = await db
          .select()
          .from(blogPostsTable)
          .where(and(...matchConditions, eq(blogPostsTable.categoryId, post.categoryId)))
          .orderBy(desc(blogPostsTable.publishedAt))
          .limit(4);
      }
      if (related.length < 4 && tagIds.length > 0) {
        const viaTags = await db
          .select({ postId: blogPostTagsTable.postId })
          .from(blogPostTagsTable)
          .where(inArray(blogPostTagsTable.tagId, tagIds));
        const candidateIds = [...new Set(viaTags.map((r) => r.postId))].filter((id) => id !== post.id);
        if (candidateIds.length > 0) {
          const more = await db
            .select()
            .from(blogPostsTable)
            .where(and(inArray(blogPostsTable.id, candidateIds), eq(blogPostsTable.status, "published")))
            .orderBy(desc(blogPostsTable.publishedAt))
            .limit(4);
          const existingIds = new Set(related.map((r) => r.id));
          related = [...related, ...more.filter((m) => !existingIds.has(m.id))].slice(0, 4);
        }
      }
    }

    const [prev] = await db
      .select()
      .from(blogPostsTable)
      .where(and(eq(blogPostsTable.status, "published"), sql`${blogPostsTable.publishedAt} < ${post.publishedAt}`))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(1);
    const [next] = await db
      .select()
      .from(blogPostsTable)
      .where(and(eq(blogPostsTable.status, "published"), sql`${blogPostsTable.publishedAt} > ${post.publishedAt}`))
      .orderBy(blogPostsTable.publishedAt)
      .limit(1);

    let cta: { name: string; description: string | null; priceKobo: number | null; productId: number } | null = null;
    if (post.ctaProductId) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, post.ctaProductId)).limit(1);
      if (product) cta = { name: product.name, description: product.description, priceKobo: product.priceKobo, productId: product.id };
    }

    const [enriched] = await enrichPosts([post]);
    res.json({
      post: enriched,
      related: await enrichPosts(related),
      prev: prev ? { title: prev.title, slug: prev.slug } : null,
      next: next ? { title: next.title, slug: next.slug } : null,
      cta,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load blog post");
    res.status(500).json({ error: "Failed to load post" });
  }
});

// ── Staff (Blog CMS) endpoints ───────────────────────────────────────────────

router.get("/admin/blog/posts", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  try {
    const conditions = [];
    const status = req.query.status ? String(req.query.status) : undefined;
    if (status) conditions.push(eq(blogPostsTable.status, status));
    if (req.query.categoryId) conditions.push(eq(blogPostsTable.categoryId, parseInt(String(req.query.categoryId), 10)));
    if (req.query.authorId) conditions.push(eq(blogPostsTable.authorId, parseInt(String(req.query.authorId), 10)));
    if (req.query.q) {
      const like = `%${String(req.query.q).toLowerCase()}%`;
      conditions.push(sql`lower(${blogPostsTable.title}) like ${like}`);
    }
    // Authors can only see/manage their own posts; editors/administrators see all.
    if (req.staffUser!.role === "author") {
      conditions.push(eq(blogPostsTable.authorId, req.staffUser!.id));
    }
    const rows = await db
      .select()
      .from(blogPostsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(blogPostsTable.updatedAt));
    res.json(await enrichPosts(rows));
  } catch (err) {
    logger.error({ err }, "Failed to list posts for CMS");
    res.status(500).json({ error: "Failed to load posts" });
  }
});

router.get("/admin/blog/posts/:id", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
  if (!post) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.staffUser!.role === "author" && post.authorId !== req.staffUser!.id) {
    res.status(403).json({ error: "You can only view your own posts." });
    return;
  }
  const tagRows = await db.select().from(blogPostTagsTable).where(eq(blogPostTagsTable.postId, id));
  res.json({ ...post, tagIds: tagRows.map((r) => r.tagId) });
});

async function setPostTags(postId: number, tagIds: number[] | undefined) {
  if (tagIds === undefined) return;
  await db.delete(blogPostTagsTable).where(eq(blogPostTagsTable.postId, postId));
  if (tagIds.length > 0) {
    await db.insert(blogPostTagsTable).values(tagIds.map((tagId) => ({ postId, tagId })));
  }
}

function canTransitionStatus(role: string, newStatus: BlogPostStatus): boolean {
  if (role === "author") return newStatus === "draft" || newStatus === "in_review";
  return true; // editor & administrator can set any status
}

router.post("/admin/blog/posts", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "Title is required." });
      return;
    }
    const content = typeof body.content === "string" ? sanitizeBlogContent(body.content) : "";
    const requestedStatus = (typeof body.status === "string" ? body.status : "draft") as BlogPostStatus;
    const status: BlogPostStatus = canTransitionStatus(req.staffUser!.role, requestedStatus) ? requestedStatus : "draft";

    const slug = await uniqueSlug(typeof body.slug === "string" && body.slug.trim() ? body.slug : title, async (candidate) => {
      const [existing] = await db.select({ id: blogPostsTable.id }).from(blogPostsTable).where(eq(blogPostsTable.slug, candidate)).limit(1);
      return !!existing;
    });

    const [created] = await db
      .insert(blogPostsTable)
      .values({
        title,
        slug,
        excerpt: typeof body.excerpt === "string" ? body.excerpt : null,
        content,
        featuredImageUrl: (body.featuredImageUrl as string) ?? null,
        featuredImageAlt: (body.featuredImageAlt as string) ?? null,
        featuredImageCaption: (body.featuredImageCaption as string) ?? null,
        authorId: req.staffUser!.id,
        categoryId: typeof body.categoryId === "number" ? body.categoryId : null,
        status,
        isFeatured: req.staffUser!.role === "author" ? false : !!body.isFeatured,
        allowComments: body.allowComments !== false,
        noIndex: !!body.noIndex,
        readingTimeMinutes: estimateReadingTimeMinutes(content),
        publishedAt: status === "published" ? new Date() : null,
        scheduledAt: status === "scheduled" && body.scheduledAt ? new Date(body.scheduledAt as string) : null,
        relatedPostIds: Array.isArray(body.relatedPostIds) ? (body.relatedPostIds as number[]) : [],
        ctaProductId: typeof body.ctaProductId === "number" ? body.ctaProductId : null,
        ctaCustomLabel: (body.ctaCustomLabel as string) ?? null,
        ctaCustomUrl: (body.ctaCustomUrl as string) ?? null,
        seoTitle: (body.seoTitle as string) ?? null,
        seoDescription: (body.seoDescription as string) ?? null,
        focusKeyword: (body.focusKeyword as string) ?? null,
        secondaryKeywords: Array.isArray(body.secondaryKeywords) ? (body.secondaryKeywords as string[]) : [],
        canonicalUrl: (body.canonicalUrl as string) ?? null,
        ogTitle: (body.ogTitle as string) ?? null,
        ogDescription: (body.ogDescription as string) ?? null,
        ogImageUrl: (body.ogImageUrl as string) ?? null,
        noFollow: !!body.noFollow,
        createdBy: req.staffUser!.id,
        updatedBy: req.staffUser!.id,
      })
      .returning();

    await setPostTags(created.id, Array.isArray(body.tagIds) ? (body.tagIds as number[]) : []);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create blog post");
    res.status(500).json({ error: "Failed to create post" });
  }
});

router.put("/admin/blog/posts/:id", requireStaffRole("administrator", "editor", "author"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [existing] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (req.staffUser!.role === "author" && existing.authorId !== req.staffUser!.id) {
      res.status(403).json({ error: "You can only edit your own posts." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.staffUser!.id };

    const stringFields = [
      "excerpt", "featuredImageUrl", "featuredImageAlt", "featuredImageCaption",
      "ctaCustomLabel", "ctaCustomUrl", "seoTitle", "seoDescription", "focusKeyword",
      "canonicalUrl", "ogTitle", "ogDescription", "ogImageUrl",
    ];
    for (const f of stringFields) {
      if (f in body) updates[f] = body[f] === "" ? null : body[f];
    }
    if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
    if (typeof body.slug === "string" && body.slug.trim() && body.slug !== existing.slug) {
      updates.slug = await uniqueSlug(body.slug, async (candidate) => {
        const [row] = await db.select({ id: blogPostsTable.id }).from(blogPostsTable).where(eq(blogPostsTable.slug, candidate)).limit(1);
        return !!row && row.id !== id;
      });
    }
    if (typeof body.content === "string") {
      updates.content = sanitizeBlogContent(body.content);
      updates.readingTimeMinutes = estimateReadingTimeMinutes(body.content);
    }
    if (typeof body.categoryId === "number" || body.categoryId === null) updates.categoryId = body.categoryId;
    if (typeof body.ctaProductId === "number" || body.ctaProductId === null) updates.ctaProductId = body.ctaProductId;
    if (Array.isArray(body.secondaryKeywords)) updates.secondaryKeywords = body.secondaryKeywords;
    if (Array.isArray(body.relatedPostIds)) updates.relatedPostIds = body.relatedPostIds;
    if (typeof body.allowComments === "boolean") updates.allowComments = body.allowComments;
    if (typeof body.noIndex === "boolean") updates.noIndex = body.noIndex;
    if (typeof body.noFollow === "boolean") updates.noFollow = body.noFollow;
    if (typeof body.isFeatured === "boolean" && req.staffUser!.role !== "author") updates.isFeatured = body.isFeatured;

    if (typeof body.status === "string") {
      const requested = body.status as BlogPostStatus;
      if (!canTransitionStatus(req.staffUser!.role, requested)) {
        res.status(403).json({ error: "Authors can only save drafts or submit for review." });
        return;
      }
      updates.status = requested;
      if (requested === "published" && existing.status !== "published") updates.publishedAt = new Date();
      if (requested === "scheduled") {
        if (!body.scheduledAt) {
          res.status(400).json({ error: "scheduledAt is required to schedule a post." });
          return;
        }
        updates.scheduledAt = new Date(body.scheduledAt as string);
      }
      if (requested !== "scheduled") updates.scheduledAt = null;
    }

    const [updated] = await db.update(blogPostsTable).set(updates as never).where(eq(blogPostsTable.id, id)).returning();
    if (Array.isArray(body.tagIds)) await setPostTags(id, body.tagIds as number[]);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update blog post");
    res.status(500).json({ error: "Failed to update post" });
  }
});

router.post("/admin/blog/posts/:id/duplicate", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [existing] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const slug = await uniqueSlug(`${existing.title}-copy`, async (candidate) => {
      const [row] = await db.select({ id: blogPostsTable.id }).from(blogPostsTable).where(eq(blogPostsTable.slug, candidate)).limit(1);
      return !!row;
    });
    const { id: _id, createdAt: _c, updatedAt: _u, viewCount: _v, ...rest } = existing;
    const [created] = await db
      .insert(blogPostsTable)
      .values({ ...rest, title: `${existing.title} (Copy)`, slug, status: "draft", publishedAt: null, scheduledAt: null, viewCount: 0 })
      .returning();
    const tagRows = await db.select().from(blogPostTagsTable).where(eq(blogPostTagsTable.postId, id));
    if (tagRows.length) await db.insert(blogPostTagsTable).values(tagRows.map((r) => ({ postId: created.id, tagId: r.tagId })));
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to duplicate post");
    res.status(500).json({ error: "Failed to duplicate post" });
  }
});

router.post("/admin/blog/posts/bulk", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const { ids, action } = req.body as { ids?: number[]; action?: string };
    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      res.status(400).json({ error: "ids and action are required." });
      return;
    }
    const statusMap: Record<string, BlogPostStatus> = {
      publish: "published",
      unpublish: "draft",
      archive: "archived",
      restore: "draft",
    };
    if (action === "delete") {
      await db.delete(blogPostTagsTable).where(inArray(blogPostTagsTable.postId, ids));
      await db.delete(blogPostsTable).where(inArray(blogPostsTable.id, ids));
    } else if (statusMap[action]) {
      const updates: Record<string, unknown> = { status: statusMap[action], updatedAt: new Date() };
      if (action === "publish") updates.publishedAt = new Date();
      await db.update(blogPostsTable).set(updates as never).where(inArray(blogPostsTable.id, ids));
    } else {
      res.status(400).json({ error: "Unknown action" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Bulk post action failed");
    res.status(500).json({ error: "Bulk action failed" });
  }
});

router.delete("/admin/blog/posts/:id", requireStaffRole("administrator", "editor"), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await db.delete(blogPostTagsTable).where(eq(blogPostTagsTable.postId, id));
    await db.delete(blogPostsTable).where(eq(blogPostsTable.id, id));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete post");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

export default router;
