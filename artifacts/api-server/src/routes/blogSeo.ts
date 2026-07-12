import { Router, type IRouter } from "express";
import { db, blogPostsTable, blogCategoriesTable, blogTagsTable, staffUsersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function baseUrl(req: import("express").Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

// Published, indexable posts + category/tag/author archive pages only.
// Drafts, in-review, scheduled, archived and no-index posts are excluded.
router.get("/blog/sitemap.xml", async (req, res): Promise<void> => {
  try {
    const [posts, categories, tags, authors] = await Promise.all([
      db.select().from(blogPostsTable).where(eq(blogPostsTable.status, "published")).orderBy(desc(blogPostsTable.publishedAt)),
      db.select().from(blogCategoriesTable),
      db.select().from(blogTagsTable),
      db.select().from(staffUsersTable).where(eq(staffUsersTable.active, true)),
    ]);
    const origin = baseUrl(req);
    const urls: string[] = [`${origin}/blog`];
    for (const p of posts.filter((p) => !p.noIndex)) urls.push(`${origin}/blog/${p.slug}`);
    for (const c of categories) urls.push(`${origin}/blog/category/${c.slug}`);
    for (const t of tags) urls.push(`${origin}/blog/tag/${t.slug}`);
    for (const a of authors) urls.push(`${origin}/blog/author/${a.authorSlug}`);

    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`)
      .join("\n")}\n</urlset>`;
    res.set("Content-Type", "application/xml").send(body);
  } catch (err) {
    logger.error({ err }, "Failed to generate blog sitemap");
    res.status(500).send("Failed to generate sitemap");
  }
});

router.get("/blog/rss.xml", async (req, res): Promise<void> => {
  try {
    const posts = await db
      .select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.status, "published"))
      .orderBy(desc(blogPostsTable.publishedAt))
      .limit(50);
    const origin = baseUrl(req);
    const items = posts
      .map(
        (p) => `  <item>
    <title>${escapeXml(p.title)}</title>
    <link>${origin}/blog/${p.slug}</link>
    <guid>${origin}/blog/${p.slug}</guid>
    <pubDate>${(p.publishedAt ?? p.createdAt).toUTCString()}</pubDate>
    <description>${escapeXml(p.excerpt ?? "")}</description>
  </item>`,
      )
      .join("\n");
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>Top Rated SEO Tools Blog</title>\n  <link>${origin}/blog</link>\n  <description>Insights and guides from Top Rated SEO Tools</description>\n${items}\n</channel></rss>`;
    res.set("Content-Type", "application/rss+xml").send(body);
  } catch (err) {
    logger.error({ err }, "Failed to generate blog RSS feed");
    res.status(500).send("Failed to generate RSS feed");
  }
});

export default router;
