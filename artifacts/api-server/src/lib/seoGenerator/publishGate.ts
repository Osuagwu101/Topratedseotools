import { db, seoQualityReportsTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

/**
 * Enforces the "human must review AI content before it goes live" rule at
 * the data layer, so it can't be bypassed by any publish path (single post
 * update, bulk publish, scheduling) — not just the AI Assistant panel's UI
 * gate. A post is blocked from publishing only when it has a quality report
 * with unresolved flagged claims / banned-phrase hits (i.e. `reviewedAt` is
 * still null). Posts with no report at all (never AI-generated) are
 * unaffected.
 */
export async function assertAiPublishReady(postId: number): Promise<{ allowed: boolean; reason?: string }> {
  const [report] = await db
    .select()
    .from(seoQualityReportsTable)
    .where(eq(seoQualityReportsTable.postId, postId))
    .orderBy(desc(seoQualityReportsTable.createdAt))
    .limit(1);

  if (!report) return { allowed: true };

  const hasIssues = (report.bannedPhraseHits as unknown[]).length > 0 || (report.flaggedClaims as unknown[]).length > 0;
  if (hasIssues && !report.reviewedAt) {
    return {
      allowed: false,
      reason: "This post has AI-generated content with flagged claims or banned-phrase hits that haven't been reviewed yet. Open the AI Assistant panel and mark the quality report reviewed before publishing.",
    };
  }
  return { allowed: true };
}

/**
 * Bulk version of the "unresolved AI review" check used by
 * `assertAiPublishReady`, for surfacing a review-needed badge on the post
 * list without an N+1 query per post. Returns the set of postIds whose most
 * recent quality report still has unreviewed flagged claims / banned-phrase
 * hits. Posts with no report, or a reviewed one, are omitted.
 */
export async function getUnresolvedReviewPostIds(postIds: number[]): Promise<Set<number>> {
  if (postIds.length === 0) return new Set();
  const reports = await db
    .select()
    .from(seoQualityReportsTable)
    .where(inArray(seoQualityReportsTable.postId, postIds))
    .orderBy(desc(seoQualityReportsTable.createdAt));

  // Reports are ordered newest-first; keep only the first (latest) one seen
  // per postId, matching the `orderBy(...).limit(1)` used per-post above.
  const latestByPost = new Map<number, typeof reports[number]>();
  for (const report of reports) {
    if (!latestByPost.has(report.postId)) latestByPost.set(report.postId, report);
  }

  const unresolved = new Set<number>();
  for (const [postId, report] of latestByPost) {
    const hasIssues = (report.bannedPhraseHits as unknown[]).length > 0 || (report.flaggedClaims as unknown[]).length > 0;
    if (hasIssues && !report.reviewedAt) unresolved.add(postId);
  }
  return unresolved;
}
