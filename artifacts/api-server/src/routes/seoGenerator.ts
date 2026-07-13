import { Router, type IRouter } from "express";
import {
  db,
  blogPostsTable,
  seoGeneratorSettingsTable,
  keywordResearchSessionsTable,
  keywordResearchItemsTable,
  contentBriefsTable,
  generationJobsTable,
  seoQualityReportsTable,
  generationUsageLogTable,
  staffUsersTable,
  sectionKeys,
  type SectionKey,
} from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import type { Response } from "express";
import { logger } from "../lib/logger";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";
import { ALLOWED_AI_MODELS, callJsonModel } from "../lib/openaiClient";
import { fetchAutocompleteSuggestions } from "../lib/seoGenerator/autocomplete";
import { fetchSerpData, estimateCompetitorWordCounts } from "../lib/seoGenerator/serpProvider";
import { buildIntentAndBriefPrompt, buildRelatedKeywordsPrompt, buildFullArticlePrompt, buildSectionRegenerationPrompt, buildClaimFlaggingPrompt } from "../lib/seoGenerator/prompts";
import { getActiveBannedPhrases } from "../lib/seoGenerator/bannedPhrases";
import { validateArticleStructure, checkKeywordPlacement, plainText } from "../lib/seoGenerator/validators";
import { checkUsageLimits, logUsage } from "../lib/seoGenerator/usageLimits";
import { assembleFullContent, saveSectionVersion, getActiveSectionVersions, listSectionVersions, restoreSectionVersion } from "../lib/seoGenerator/contentAssembly";

const router: IRouter = Router();
router.use(attachStaffUser);

const STAFF_ROLES = ["administrator", "editor", "author"] as const;

async function getOrCreateSettings() {
  const [row] = await db.select().from(seoGeneratorSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(seoGeneratorSettingsTable).values({}).returning();
  return created;
}

async function getPostOr404(postId: number) {
  const [post] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, postId)).limit(1);
  return post ?? null;
}

/**
 * Loads the post and enforces the same author-ownership rule used by the
 * regular blog post admin routes: authors may only touch their own posts,
 * while editors/administrators may touch any post. Writes the appropriate
 * 404/403 response and returns null when access should be denied.
 */
async function assertPostAccess(
  req: { staffUser?: { id: number; role: string } },
  res: Response,
  postId: number,
) {
  const post = await getPostOr404(postId);
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return null;
  }
  if (req.staffUser!.role === "author" && post.authorId !== req.staffUser!.id) {
    res.status(403).json({ error: "You do not have permission to modify this post." });
    return null;
  }
  return post;
}

// ── Provider settings (Administrator only for writes) ───────────────────────

router.get("/admin/blog/seo-generator/settings", requireStaffRole(...STAFF_ROLES), async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const { serpApiKey, ...rest } = settings;
  res.json({ ...rest, hasSerpApiKey: Boolean(serpApiKey) });
});

router.put("/admin/blog/seo-generator/settings", requireStaffRole("administrator"), async (req, res): Promise<void> => {
  try {
    const current = await getOrCreateSettings();
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.staffUser!.id };

    if (typeof body.aiModel === "string" && (ALLOWED_AI_MODELS as readonly string[]).includes(body.aiModel)) {
      updates.aiModel = body.aiModel;
    }
    if (body.serpProvider === null || body.serpProvider === "serpapi" || body.serpProvider === "searchapi") {
      updates.serpProvider = body.serpProvider;
    }
    // Only overwrite the stored key when the client explicitly sends a new
    // non-empty value; an empty string clears it. Undefined leaves it as-is.
    if (typeof body.serpApiKey === "string") {
      updates.serpApiKey = body.serpApiKey.trim() ? body.serpApiKey.trim() : null;
    }
    if (typeof body.cacheDurationMinutes === "number") updates.cacheDurationMinutes = body.cacheDurationMinutes;
    if (typeof body.perUserDailyLimit === "number") updates.perUserDailyLimit = body.perUserDailyLimit;
    if (typeof body.monthlyGenerationLimit === "number") updates.monthlyGenerationLimit = body.monthlyGenerationLimit;
    if (typeof body.confirmBeforeExpensiveOps === "boolean") updates.confirmBeforeExpensiveOps = body.confirmBeforeExpensiveOps;

    const [updated] = await db
      .update(seoGeneratorSettingsTable)
      .set(updates as never)
      .where(eq(seoGeneratorSettingsTable.id, current.id))
      .returning();
    const { serpApiKey, ...rest } = updated;
    res.json({ ...rest, hasSerpApiKey: Boolean(serpApiKey) });
  } catch (err) {
    logger.error({ err }, "Failed to update SEO generator settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/admin/blog/seo-generator/usage", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const { getUsageCounts } = await import("../lib/seoGenerator/usageLimits");
  const counts = await getUsageCounts(req.staffUser!.id);
  const settings = await getOrCreateSettings();
  res.json({ ...counts, perUserDailyLimit: settings.perUserDailyLimit, monthlyGenerationLimit: settings.monthlyGenerationLimit });
});

// Admin-only usage/cost history report: generation counts by day and by staff
// member, plus a recent activity feed, so admins can track AI generator spend
// over time (separate from the live per-user counter surfaced in the settings
// endpoint above). Restricted to administrators since it exposes what every
// staff member has been doing, not just the requester's own usage.
router.get("/admin/blog/seo-generator/usage-history", requireStaffRole("administrator"), async (req, res): Promise<void> => {
  try {
    const daysParam = parseInt(String(req.query.days ?? "30"), 10);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const settings = await getOrCreateSettings();

    const [dailyCounts, byStaff, recentEntries] = await Promise.all([
      db
        .select({
          date: sql<string>`to_char(date_trunc('day', ${generationUsageLogTable.createdAt}), 'YYYY-MM-DD')`,
          action: generationUsageLogTable.action,
          count: sql<number>`count(*)::int`,
        })
        .from(generationUsageLogTable)
        .where(gte(generationUsageLogTable.createdAt, since))
        .groupBy(sql`date_trunc('day', ${generationUsageLogTable.createdAt})`, generationUsageLogTable.action)
        .orderBy(sql`date_trunc('day', ${generationUsageLogTable.createdAt})`),
      db
        .select({
          staffUserId: generationUsageLogTable.staffUserId,
          staffName: staffUsersTable.name,
          staffEmail: staffUsersTable.email,
          count: sql<number>`count(*)::int`,
          lastUsedAt: sql<string>`max(${generationUsageLogTable.createdAt})`,
        })
        .from(generationUsageLogTable)
        .leftJoin(staffUsersTable, eq(generationUsageLogTable.staffUserId, staffUsersTable.id))
        .where(gte(generationUsageLogTable.createdAt, since))
        .groupBy(generationUsageLogTable.staffUserId, staffUsersTable.name, staffUsersTable.email)
        .orderBy(sql`count(*) desc`),
      db
        .select({
          id: generationUsageLogTable.id,
          action: generationUsageLogTable.action,
          detail: generationUsageLogTable.detail,
          createdAt: generationUsageLogTable.createdAt,
          postId: generationUsageLogTable.postId,
          postTitle: blogPostsTable.title,
          staffName: staffUsersTable.name,
          staffEmail: staffUsersTable.email,
        })
        .from(generationUsageLogTable)
        .leftJoin(staffUsersTable, eq(generationUsageLogTable.staffUserId, staffUsersTable.id))
        .leftJoin(blogPostsTable, eq(generationUsageLogTable.postId, blogPostsTable.id))
        .orderBy(desc(generationUsageLogTable.createdAt))
        .limit(100),
    ]);

    const { getUsageCounts } = await import("../lib/seoGenerator/usageLimits");
    const currentCounts = await getUsageCounts(req.staffUser!.id);

    res.json({
      days,
      dailyCounts,
      byStaff,
      recentEntries,
      limits: {
        perUserDailyLimit: settings.perUserDailyLimit,
        monthlyGenerationLimit: settings.monthlyGenerationLimit,
        monthCount: currentCounts.monthCount,
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to load SEO generator usage history");
    res.status(500).json({ error: "Failed to load usage history" });
  }
});

// ── Keyword research ─────────────────────────────────────────────────────────

router.post("/admin/blog/posts/:postId/seo-generator/research", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  try {
    const postId = parseInt(String(req.params.postId), 10);
    const post = await assertPostAccess(req, res, postId);
    if (!post) return;
    const { primaryKeyword } = req.body as { primaryKeyword?: string };
    if (!primaryKeyword?.trim()) {
      res.status(400).json({ error: "A primary keyword is required." });
      return;
    }

    const settings = await getOrCreateSettings();

    const [autocomplete, relatedResult, serpData] = await Promise.all([
      fetchAutocompleteSuggestions(primaryKeyword),
      callJsonModel<{ relatedKeywords: string[] }>({
        model: settings.aiModel,
        ...buildRelatedKeywordsPrompt(primaryKeyword),
      }).catch((err) => {
        logger.warn({ err }, "Related-keyword generation failed");
        return { relatedKeywords: [] };
      }),
      fetchSerpData(primaryKeyword, settings),
    ]);

    const competitorsWithCounts = serpData.competitors.length
      ? await estimateCompetitorWordCounts(serpData.competitors)
      : [];
    const wordCounts = competitorsWithCounts.map((c) => c.wordCount).filter((n): n is number => typeof n === "number");
    const recommendedWordCount = wordCounts.length
      ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length)
      : null;

    const [session] = await db
      .insert(keywordResearchSessionsTable)
      .values({
        postId,
        primaryKeyword: primaryKeyword.trim(),
        recommendedWordCount,
        serpDataAvailable: Boolean(settings.serpProvider && settings.serpApiKey),
        createdBy: req.staffUser!.id,
      })
      .returning();

    const items: (typeof keywordResearchItemsTable.$inferInsert)[] = [
      ...autocomplete.map((value) => ({ sessionId: session.id, kind: "autocomplete", value })),
      ...relatedResult.relatedKeywords.map((value) => ({ sessionId: session.id, kind: "related_keyword", value })),
      ...serpData.peopleAlsoAsk.map((value) => ({ sessionId: session.id, kind: "paa", value })),
      ...serpData.relatedSearches.map((value) => ({ sessionId: session.id, kind: "related_search", value })),
      ...competitorsWithCounts.map((c) => ({
        sessionId: session.id,
        kind: "competitor",
        value: c.url,
        extra: { title: c.title ?? null, wordCount: c.wordCount ?? null },
      })),
    ];
    const insertedItems = items.length ? await db.insert(keywordResearchItemsTable).values(items).returning() : [];

    await logUsage({ staffUserId: req.staffUser!.id, postId, action: "research", detail: primaryKeyword });

    res.status(201).json({ session, items: insertedItems });
  } catch (err) {
    logger.error({ err }, "Keyword research failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Keyword research failed" });
  }
});

router.get("/admin/blog/posts/:postId/seo-generator/research", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  const post = await assertPostAccess(req, res, postId);
  if (!post) return;
  const [session] = await db
    .select()
    .from(keywordResearchSessionsTable)
    .where(eq(keywordResearchSessionsTable.postId, postId))
    .orderBy(desc(keywordResearchSessionsTable.createdAt))
    .limit(1);
  if (!session) {
    res.json({ session: null, items: [], brief: null });
    return;
  }
  const items = await db.select().from(keywordResearchItemsTable).where(eq(keywordResearchItemsTable.sessionId, session.id));
  const [brief] = await db.select().from(contentBriefsTable).where(eq(contentBriefsTable.postId, postId)).limit(1);
  res.json({ session, items, brief: brief ?? null });
});

router.put("/admin/blog/seo-generator/research-items/:id", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [item] = await db.select().from(keywordResearchItemsTable).where(eq(keywordResearchItemsTable.id, id)).limit(1);
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [session] = await db.select().from(keywordResearchSessionsTable).where(eq(keywordResearchSessionsTable.id, item.sessionId)).limit(1);
  if (!session) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await assertPostAccess(req, res, session.postId))) return;

  const { value, included } = req.body as { value?: string; included?: boolean };
  const updates: Record<string, unknown> = { editedByUser: true };
  if (typeof value === "string") updates.value = value;
  if (typeof included === "boolean") updates.included = included;
  const [updated] = await db.update(keywordResearchItemsTable).set(updates as never).where(eq(keywordResearchItemsTable.id, id)).returning();
  res.json(updated);
});

// ── Content brief ────────────────────────────────────────────────────────────

router.post("/admin/blog/posts/:postId/seo-generator/brief", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  try {
    const postId = parseInt(String(req.params.postId), 10);
    if (!(await assertPostAccess(req, res, postId))) return;
    const { sessionId } = req.body as { sessionId?: number };
    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }
    const [session] = await db.select().from(keywordResearchSessionsTable).where(eq(keywordResearchSessionsTable.id, sessionId)).limit(1);
    if (!session || session.postId !== postId) {
      res.status(404).json({ error: "Research session not found" });
      return;
    }
    const items = await db
      .select()
      .from(keywordResearchItemsTable)
      .where(and(eq(keywordResearchItemsTable.sessionId, sessionId), eq(keywordResearchItemsTable.included, true)));

    const byKind = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.value);
    const competitorWordCounts = items
      .filter((i) => i.kind === "competitor" && (i.extra as any)?.wordCount)
      .map((i) => (i.extra as any).wordCount as number);

    const settings = await getOrCreateSettings();
    const briefResult = await callJsonModel<{
      searchIntent: string;
      targetWordCount: number;
      headingOutline: { level: number; text: string }[];
      faqCandidates: { question: string }[];
      featuredSnippetTarget: string;
      notes: string;
    }>({
      model: settings.aiModel,
      ...buildIntentAndBriefPrompt({
        primaryKeyword: session.primaryKeyword,
        autocomplete: byKind("autocomplete"),
        relatedKeywords: byKind("related_keyword"),
        peopleAlsoAsk: byKind("paa"),
        relatedSearches: byKind("related_search"),
        competitorWordCounts,
      }),
    });

    await db.update(keywordResearchSessionsTable).set({ searchIntent: briefResult.searchIntent, status: "ready", updatedAt: new Date() }).where(eq(keywordResearchSessionsTable.id, sessionId));

    const [existing] = await db.select().from(contentBriefsTable).where(eq(contentBriefsTable.postId, postId)).limit(1);
    let brief;
    if (existing) {
      [brief] = await db
        .update(contentBriefsTable)
        .set({
          sessionId,
          searchIntent: briefResult.searchIntent,
          targetWordCount: briefResult.targetWordCount,
          headingOutline: briefResult.headingOutline,
          faqCandidates: briefResult.faqCandidates,
          featuredSnippetTarget: briefResult.featuredSnippetTarget,
          notes: briefResult.notes,
          updatedAt: new Date(),
        })
        .where(eq(contentBriefsTable.id, existing.id))
        .returning();
    } else {
      [brief] = await db
        .insert(contentBriefsTable)
        .values({
          postId,
          sessionId,
          searchIntent: briefResult.searchIntent,
          targetWordCount: briefResult.targetWordCount,
          headingOutline: briefResult.headingOutline,
          faqCandidates: briefResult.faqCandidates,
          featuredSnippetTarget: briefResult.featuredSnippetTarget,
          notes: briefResult.notes,
          createdBy: req.staffUser!.id,
        })
        .returning();
    }

    await logUsage({ staffUserId: req.staffUser!.id, postId, action: "brief" });
    res.status(201).json(brief);
  } catch (err) {
    logger.error({ err }, "Content brief generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Content brief generation failed" });
  }
});

router.put("/admin/blog/posts/:postId/seo-generator/brief", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  if (!(await assertPostAccess(req, res, postId))) return;
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.searchIntent === "string") updates.searchIntent = body.searchIntent;
  if (typeof body.targetWordCount === "number") updates.targetWordCount = body.targetWordCount;
  if (Array.isArray(body.headingOutline)) updates.headingOutline = body.headingOutline;
  if (Array.isArray(body.faqCandidates)) updates.faqCandidates = body.faqCandidates;
  if (typeof body.featuredSnippetTarget === "string") updates.featuredSnippetTarget = body.featuredSnippetTarget;
  if (typeof body.notes === "string") updates.notes = body.notes;
  const [updated] = await db.update(contentBriefsTable).set(updates as never).where(eq(contentBriefsTable.postId, postId)).returning();
  if (!updated) {
    res.status(404).json({ error: "No brief found for this post" });
    return;
  }
  res.json(updated);
});

// ── Full article generation ──────────────────────────────────────────────────

router.post("/admin/blog/posts/:postId/seo-generator/generate", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  try {
    const post = await assertPostAccess(req, res, postId);
    if (!post) return;
    const { confirm } = req.body as { confirm?: boolean };
    const settings = await getOrCreateSettings();

    if (settings.confirmBeforeExpensiveOps && !confirm) {
      res.status(409).json({ requiresConfirmation: true, message: "Generating a full article calls the AI model and counts against your daily limit. Confirm to proceed." });
      return;
    }

    const limitCheck = await checkUsageLimits(req.staffUser!.id, settings);
    if (!limitCheck.allowed) {
      res.status(429).json({ error: limitCheck.reason });
      return;
    }

    const [session] = await db
      .select()
      .from(keywordResearchSessionsTable)
      .where(eq(keywordResearchSessionsTable.postId, postId))
      .orderBy(desc(keywordResearchSessionsTable.createdAt))
      .limit(1);
    const [brief] = await db.select().from(contentBriefsTable).where(eq(contentBriefsTable.postId, postId)).limit(1);
    if (!session || !brief) {
      res.status(400).json({ error: "Run keyword research and generate a content brief before generating the full article." });
      return;
    }

    const [job] = await db
      .insert(generationJobsTable)
      .values({ postId, sessionId: session.id, jobType: "full_article", status: "running", model: settings.aiModel, createdBy: req.staffUser!.id })
      .returning();

    const items = await db
      .select()
      .from(keywordResearchItemsTable)
      .where(and(eq(keywordResearchItemsTable.sessionId, session.id), eq(keywordResearchItemsTable.included, true)));
    const secondaryKeywords = items.filter((i) => i.kind === "related_keyword" || i.kind === "autocomplete").map((i) => i.value);

    const article = await callJsonModel<{
      title: string;
      metaDescription: string;
      featuredSnippet: string;
      introHtml: string;
      bodyHtml: string;
      faqHtml: string;
      conclusionHtml: string;
    }>({
      model: settings.aiModel,
      maxTokens: 8192,
      ...buildFullArticlePrompt({
        primaryKeyword: session.primaryKeyword,
        secondaryKeywords,
        searchIntent: brief.searchIntent,
        targetWordCount: brief.targetWordCount,
        headingOutline: brief.headingOutline as { level: number; text: string }[],
        faqCandidates: brief.faqCandidates as { question: string }[],
        featuredSnippetTarget: brief.featuredSnippetTarget ?? session.primaryKeyword,
      }),
    });

    const bannedPhrases = await getActiveBannedPhrases();
    const structural = await validateArticleStructure({
      introHtml: article.introHtml,
      conclusionHtml: article.conclusionHtml,
      featuredSnippet: article.featuredSnippet,
      bodyHtml: article.bodyHtml,
      bannedPhrases,
    });

    const sectionsToSave: { key: SectionKey; content: string }[] = [
      { key: "intro", content: article.introHtml },
      { key: "body", content: article.bodyHtml },
      { key: "faq", content: article.faqHtml },
      { key: "conclusion", content: article.conclusionHtml },
      { key: "featured_snippet", content: article.featuredSnippet },
    ];
    for (const s of sectionsToSave) {
      await saveSectionVersion({ postId, sectionKey: s.key, content: s.content, jobId: job.id, createdBy: req.staffUser!.id });
    }

    const activeSections = await getActiveSectionVersions(postId);
    const fullContent = assembleFullContent(activeSections);

    const keywordPlacement = checkKeywordPlacement({
      fullContentHtml: fullContent,
      title: article.title,
      metaDescription: article.metaDescription,
      primaryKeyword: session.primaryKeyword,
    });

    // Save to the post itself. AI-generated content is never allowed to go
    // live without a human re-reviewing it: even if the post was already
    // published, writing new AI content here demotes it back to draft so an
    // editor must consciously re-publish after review.
    await db
      .update(blogPostsTable)
      .set({
        title: post.title || article.title,
        content: fullContent,
        seoTitle: post.seoTitle || article.title,
        seoDescription: post.seoDescription || article.metaDescription,
        focusKeyword: session.primaryKeyword,
        secondaryKeywords: secondaryKeywords.slice(0, 15),
        status: "draft",
        updatedBy: req.staffUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(blogPostsTable.id, postId));

    const claimFlagResult = await callJsonModel<{ flaggedClaims: string[] }>({
      model: settings.aiModel,
      ...buildClaimFlaggingPrompt(plainText(fullContent)),
    }).catch(() => ({ flaggedClaims: [] }));

    const resultSummary = { structural, keywordPlacement, flaggedClaims: claimFlagResult.flaggedClaims };
    await db.update(generationJobsTable).set({ status: "succeeded", resultSummary, completedAt: new Date() }).where(eq(generationJobsTable.id, job.id));

    const [report] = await db
      .insert(seoQualityReportsTable)
      .values({
        postId,
        jobId: job.id,
        keywordPlacementScore: keywordPlacement.score,
        readabilityScore: Math.max(0, 100 - Math.round(structural.sentenceVariation.stdDev < 3 ? 20 : 0) - structural.bannedPhraseHits.length * 10),
        lengthCheckPassed: structural.introInRange && structural.conclusionInRange && structural.featuredSnippetInRange,
        introWordCount: structural.introWordCount,
        conclusionWordCount: structural.conclusionWordCount,
        featuredSnippetLength: structural.featuredSnippetLength,
        bannedPhraseHits: structural.bannedPhraseHits,
        flaggedClaims: claimFlagResult.flaggedClaims,
        reportJson: resultSummary,
      })
      .returning();

    await logUsage({ staffUserId: req.staffUser!.id, postId, action: "generate_full" });

    const [updatedPost] = await db.select().from(blogPostsTable).where(eq(blogPostsTable.id, postId)).limit(1);
    res.status(201).json({ job, report, post: updatedPost, article: { title: article.title, metaDescription: article.metaDescription } });
  } catch (err) {
    logger.error({ err }, "Full article generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Article generation failed" });
  }
});

router.post("/admin/blog/posts/:postId/seo-generator/regenerate-section", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  try {
    const post = await assertPostAccess(req, res, postId);
    if (!post) return;
    const { sectionKey, confirm, instructions } = req.body as { sectionKey?: SectionKey; confirm?: boolean; instructions?: string };
    if (!sectionKey || !(sectionKeys as readonly string[]).includes(sectionKey)) {
      res.status(400).json({ error: "A valid sectionKey is required." });
      return;
    }
    const settings = await getOrCreateSettings();
    if (settings.confirmBeforeExpensiveOps && !confirm) {
      res.status(409).json({ requiresConfirmation: true, message: "Regenerating this section calls the AI model and counts against your daily limit. Confirm to proceed." });
      return;
    }
    const limitCheck = await checkUsageLimits(req.staffUser!.id, settings);
    if (!limitCheck.allowed) {
      res.status(429).json({ error: limitCheck.reason });
      return;
    }

    const [session] = await db
      .select()
      .from(keywordResearchSessionsTable)
      .where(eq(keywordResearchSessionsTable.postId, postId))
      .orderBy(desc(keywordResearchSessionsTable.createdAt))
      .limit(1);
    if (!session) {
      res.status(400).json({ error: "Run keyword research before regenerating a section." });
      return;
    }

    const [job] = await db
      .insert(generationJobsTable)
      .values({ postId, sessionId: session.id, jobType: "section", sectionKey, status: "running", model: settings.aiModel, createdBy: req.staffUser!.id })
      .returning();

    const contextSummary = plainText(post.content).slice(0, 2000) || "(no existing content yet)";
    const result = await callJsonModel<{ html: string }>({
      model: settings.aiModel,
      ...buildSectionRegenerationPrompt({
        sectionKey,
        primaryKeyword: session.primaryKeyword,
        searchIntent: session.searchIntent ?? "informational",
        contextSummary,
        instructions,
      }),
    });

    await saveSectionVersion({ postId, sectionKey, content: result.html, jobId: job.id, createdBy: req.staffUser!.id });

    const activeSections = await getActiveSectionVersions(postId);
    const fullContent = assembleFullContent(activeSections);
    // Same rule as full-article generation: AI-touched content always demotes
    // the post back to draft, even if it was previously published, so a human
    // must re-review before it goes live again.
    await db.update(blogPostsTable).set({ content: fullContent, updatedBy: req.staffUser!.id, updatedAt: new Date(), status: "draft" }).where(eq(blogPostsTable.id, postId));

    const bannedPhrases = await getActiveBannedPhrases();
    const bannedPhraseHits = bannedPhrases.filter((p) => result.html.toLowerCase().includes(p.toLowerCase()));

    await db.update(generationJobsTable).set({ status: "succeeded", resultSummary: { bannedPhraseHits }, completedAt: new Date() }).where(eq(generationJobsTable.id, job.id));
    await logUsage({ staffUserId: req.staffUser!.id, postId, action: "regenerate_section", detail: sectionKey });

    res.status(201).json({ job, sectionKey, html: result.html, bannedPhraseHits, fullContent });
  } catch (err) {
    logger.error({ err }, "Section regeneration failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Section regeneration failed" });
  }
});

router.get("/admin/blog/posts/:postId/seo-generator/versions", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  if (!(await assertPostAccess(req, res, postId))) return;
  const sectionKey = String(req.query.sectionKey || "");
  if (!sectionKey) {
    res.status(400).json({ error: "sectionKey query param is required" });
    return;
  }
  const versions = await listSectionVersions(postId, sectionKey);
  res.json(versions);
});

router.post("/admin/blog/posts/:postId/seo-generator/versions/:versionId/restore", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  try {
    const postId = parseInt(String(req.params.postId), 10);
    if (!(await assertPostAccess(req, res, postId))) return;
    const versionId = parseInt(String(req.params.versionId), 10);
    await restoreSectionVersion(postId, versionId);
    const activeSections = await getActiveSectionVersions(postId);
    const fullContent = assembleFullContent(activeSections);
    // Restoring an older AI-generated section version also changes live
    // content — demote to draft so it gets human re-review before publishing,
    // same rule as full-article generation and section regeneration.
    await db.update(blogPostsTable).set({ content: fullContent, status: "draft", updatedAt: new Date() }).where(eq(blogPostsTable.id, postId));
    const post = await getPostOr404(postId);
    res.json({ fullContent, post });
  } catch (err) {
    logger.error({ err }, "Version restore failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "Restore failed" });
  }
});

router.get("/admin/blog/posts/:postId/seo-generator/quality-report", requireStaffRole(...STAFF_ROLES), async (req, res): Promise<void> => {
  const postId = parseInt(String(req.params.postId), 10);
  if (!(await assertPostAccess(req, res, postId))) return;
  const [report] = await db.select().from(seoQualityReportsTable).where(eq(seoQualityReportsTable.postId, postId)).orderBy(desc(seoQualityReportsTable.createdAt)).limit(1);
  res.json(report ?? null);
});

export default router;
