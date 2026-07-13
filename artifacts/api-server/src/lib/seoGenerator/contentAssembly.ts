import { db, postSectionVersionsTable, type SectionKey } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { sanitizeBlogContent } from "../sanitizeBlogHtml";

/** Order sections appear in the assembled post content. FAQ comes after the body, before the conclusion. */
const SECTION_ORDER: SectionKey[] = ["intro", "featured_snippet", "body", "faq", "conclusion"];

export async function getActiveSectionVersions(postId: number): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(postSectionVersionsTable)
    .where(and(eq(postSectionVersionsTable.postId, postId), eq(postSectionVersionsTable.isActive, true)));
  const bySection: Record<string, string> = {};
  for (const row of rows) bySection[row.sectionKey] = row.content;
  return bySection;
}

/**
 * Assembles the post's stored `content` HTML from the active section
 * versions. The "featured_snippet" section is rendered as a visually
 * distinct callout box placed right after the introduction — the
 * paragraph that explicitly answers the search intent — rather than
 * before it.
 */
export function assembleFullContent(sections: Record<string, string>): string {
  const parts: string[] = [];
  for (const key of SECTION_ORDER) {
    if (key === "featured_snippet") {
      if (sections.featured_snippet) {
        parts.push(
          sanitizeBlogContent(
            `<div class="featured-snippet-answer" data-seo-featured-snippet="true"><p><strong>${sections.featured_snippet}</strong></p></div>`,
          ),
        );
      }
      continue;
    }
    if (sections[key]) parts.push(sections[key]);
  }
  // Sections are already sanitized individually in saveSectionVersion before
  // storage, but we sanitize the fully assembled HTML again here as a final
  // defence-in-depth pass before it is ever written to blogPostsTable.content.
  return sanitizeBlogContent(parts.join("\n\n"));
}

export async function saveSectionVersion(params: {
  postId: number;
  sectionKey: SectionKey;
  content: string;
  jobId?: number | null;
  createdBy: number;
}): Promise<void> {
  const [latest] = await db
    .select({ versionNumber: postSectionVersionsTable.versionNumber })
    .from(postSectionVersionsTable)
    .where(and(eq(postSectionVersionsTable.postId, params.postId), eq(postSectionVersionsTable.sectionKey, params.sectionKey)))
    .orderBy(desc(postSectionVersionsTable.versionNumber))
    .limit(1);

  const nextVersion = (latest?.versionNumber ?? 0) + 1;

  // AI-generated HTML is untrusted (model output / potential prompt injection)
  // and is rendered as raw HTML on public pages, so sanitize before it is ever
  // persisted — same sanitizer used for staff-authored post content.
  const safeContent = sanitizeBlogContent(params.content);

  await db
    .update(postSectionVersionsTable)
    .set({ isActive: false })
    .where(and(eq(postSectionVersionsTable.postId, params.postId), eq(postSectionVersionsTable.sectionKey, params.sectionKey)));

  await db.insert(postSectionVersionsTable).values({
    postId: params.postId,
    sectionKey: params.sectionKey,
    versionNumber: nextVersion,
    content: safeContent,
    isActive: true,
    jobId: params.jobId ?? null,
    createdBy: params.createdBy,
  });
}

export async function listSectionVersions(postId: number, sectionKey: string) {
  return db
    .select()
    .from(postSectionVersionsTable)
    .where(and(eq(postSectionVersionsTable.postId, postId), eq(postSectionVersionsTable.sectionKey, sectionKey)))
    .orderBy(desc(postSectionVersionsTable.versionNumber));
}

export async function restoreSectionVersion(postId: number, versionId: number): Promise<void> {
  const [version] = await db
    .select()
    .from(postSectionVersionsTable)
    .where(and(eq(postSectionVersionsTable.id, versionId), eq(postSectionVersionsTable.postId, postId)))
    .limit(1);
  if (!version) throw new Error("Version not found");

  await db
    .update(postSectionVersionsTable)
    .set({ isActive: false })
    .where(and(eq(postSectionVersionsTable.postId, postId), eq(postSectionVersionsTable.sectionKey, version.sectionKey)));

  await db.update(postSectionVersionsTable).set({ isActive: true }).where(eq(postSectionVersionsTable.id, versionId));
}
