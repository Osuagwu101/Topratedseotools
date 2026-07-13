// Periodic "link insights" scan for the AI Article Generator: finds internal
// links that now point nowhere (product/post removed, hidden, or
// unpublished since the link was written) and flags posts that are under the
// 5-internal-link cap but have a genuinely relevant product/post they could
// link to. Runs just-in-time (triggered by an admin request once the last
// scan is stale) rather than via a dedicated background worker, matching the
// rest of this codebase's "no cron" architecture.
import { db, blogPostsTable, productsTable, seoLinkInsightsTable, type SeoGeneratorSettings } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateJsonWithFallback, type AiProvider } from "./aiClient";
import { buildLinkOpportunityPrompt } from "./prompts";
import { logger } from "../logger";

export const MAX_INTERNAL_LINKS_PER_POST = 5;
// Bound LLM spend per scan run — any posts beyond this are picked up on the
// next scan once this one's throttle window has passed.
const MAX_OPPORTUNITY_CHECKS_PER_SCAN = 25;
const SCAN_STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

interface ExtractedLink {
  href: string;
  anchorText: string;
}

/** Extracts every internal-looking <a href> from post HTML content. */
function extractLinks(html: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    links.push({ href: match[1], anchorText: match[2].replace(/<[^>]*>/g, "").trim() });
  }
  return links;
}

function isInternalTargetHref(href: string): boolean {
  return /^\/products\/\d+$/.test(href) || /^\/blog\/[a-z0-9-]+$/i.test(href);
}

export function isScanStale(settings: Pick<SeoGeneratorSettings, "lastLinkInsightsScanAt">): boolean {
  if (!settings.lastLinkInsightsScanAt) return true;
  return Date.now() - new Date(settings.lastLinkInsightsScanAt).getTime() > SCAN_STALE_AFTER_MS;
}

/**
 * Recomputes broken-link and link-opportunity insights across every
 * non-archived post and replaces the stored snapshot. Broken-link detection
 * is cheap (regex + DB lookups); link-opportunity suggestions call the LLM,
 * capped per run, and are skipped outright for any post already at the
 * 5-internal-link cap so no cost is spent on posts that can't take a
 * recommendation anyway.
 */
export async function runLinkInsightsScan(defaultProvider: AiProvider, defaultModel: string): Promise<void> {
  const posts = await db
    .select({ id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title, content: blogPostsTable.content, status: blogPostsTable.status })
    .from(blogPostsTable)
    .where(sql`${blogPostsTable.status} != 'archived'`);

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, description: productsTable.description })
    .from(productsTable)
    .where(and(eq(productsTable.isHidden, false), eq(productsTable.isDeleted, false)));
  const validProductIds = new Set(products.map((p) => p.id));

  const publishedPosts = await db
    .select({ id: blogPostsTable.id, slug: blogPostsTable.slug, title: blogPostsTable.title, excerpt: blogPostsTable.excerpt })
    .from(blogPostsTable)
    .where(eq(blogPostsTable.status, "published"));
  const validPostSlugs = new Map(publishedPosts.map((p) => [p.slug, p]));

  const newRows: { postId: number; kind: "broken_link" | "link_opportunity"; details: Record<string, unknown> }[] = [];
  let opportunityChecksUsed = 0;

  for (const post of posts) {
    const links = extractLinks(post.content).filter((l) => isInternalTargetHref(l.href));
    let validLinkCount = 0;

    for (const link of links) {
      const productMatch = link.href.match(/^\/products\/(\d+)$/);
      const postMatch = link.href.match(/^\/blog\/([a-z0-9-]+)$/i);
      const isBroken = productMatch
        ? !validProductIds.has(Number(productMatch[1]))
        : postMatch
          ? !validPostSlugs.has(postMatch[1]) || postMatch[1] === post.slug
          : true;
      if (isBroken) {
        newRows.push({ postId: post.id, kind: "broken_link", details: { href: link.href, anchorText: link.anchorText } });
      } else {
        validLinkCount++;
      }
    }

    // Never recommend adding a link to a post already at (or already over,
    // from manual edits) the cap — this is the whole point of the feature.
    if (validLinkCount >= MAX_INTERNAL_LINKS_PER_POST) continue;
    if (opportunityChecksUsed >= MAX_OPPORTUNITY_CHECKS_PER_SCAN) continue;
    if (post.status !== "published" && post.status !== "draft") continue;

    const linkedProductIds = new Set(
      links.map((l) => l.href.match(/^\/products\/(\d+)$/)?.[1]).filter(Boolean).map(Number),
    );
    const linkedPostSlugs = new Set(links.map((l) => l.href.match(/^\/blog\/([a-z0-9-]+)$/i)?.[1]).filter(Boolean));

    const candidateProducts = products.filter((p) => !linkedProductIds.has(p.id));
    const candidatePosts = publishedPosts.filter((p) => p.id !== post.id && !linkedPostSlugs.has(p.slug));
    if (candidateProducts.length === 0 && candidatePosts.length === 0) continue;

    opportunityChecksUsed++;
    try {
      const { data } = await generateJsonWithFallback<{ hasOpportunity: boolean; targetType?: "product" | "post"; targetId?: number; targetSlug?: string; targetLabel?: string; reason?: string }>({
        provider: defaultProvider,
        model: defaultModel,
        ...buildLinkOpportunityPrompt({
          postTitle: post.title,
          postExcerptOrIntro: post.content.replace(/<[^>]*>/g, " ").slice(0, 600),
          currentLinkCount: validLinkCount,
          candidateProducts: candidateProducts.map((p) => ({ id: p.id, name: p.name, description: p.description })),
          candidatePosts: candidatePosts.map((p) => ({ slug: p.slug, title: p.title, excerpt: p.excerpt ?? "" })),
        }),
      });
      if (data.hasOpportunity && data.targetType && data.targetLabel && data.reason) {
        const targetValid =
          data.targetType === "product" ? candidateProducts.some((p) => p.id === data.targetId) : candidatePosts.some((p) => p.slug === data.targetSlug);
        if (targetValid) {
          newRows.push({
            postId: post.id,
            kind: "link_opportunity",
            details: {
              targetType: data.targetType,
              targetId: data.targetId,
              targetSlug: data.targetSlug,
              targetLabel: data.targetLabel,
              reason: data.reason,
              currentLinkCount: validLinkCount,
            },
          });
        }
      }
    } catch (err) {
      // A single post's opportunity check failing (quota exhausted, bad
      // JSON) shouldn't abort the whole scan — broken-link findings for
      // every other post are still worth keeping.
      logger.warn({ err, postId: post.id }, "Link insight opportunity check failed for post; skipping");
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(seoLinkInsightsTable);
    if (newRows.length > 0) {
      await tx.insert(seoLinkInsightsTable).values(newRows);
    }
  });
}
