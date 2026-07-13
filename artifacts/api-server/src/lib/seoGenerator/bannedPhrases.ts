import { db, bannedPhrasesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Common AI-writing clichés to keep generated copy sounding like a human
// writer rather than an obviously AI-generated article. Seeded once; admins
// could extend this list directly in the DB later.
export const DEFAULT_BANNED_PHRASES: string[] = [
  "in today's fast-paced world",
  "in today's digital age",
  "unlock the power of",
  "unlock the potential of",
  "delve into",
  "dive into the world of",
  "navigate the landscape",
  "navigate the world of",
  "game-changer",
  "game changing",
  "in the realm of",
  "when it comes to",
  "it's worth noting that",
  "it is important to note that",
  "at the end of the day",
  "the ever-evolving",
  "in the ever-changing",
  "boasts an impressive",
  "elevate your",
  "take your ... to the next level",
  "take it to the next level",
  "seamless integration",
  "seamlessly integrate",
  "robust solution",
  "unparalleled",
  "testament to",
  "a testament to",
  "leverage the power of",
  "in conclusion,",
  "in summary,",
  "to sum up,",
  "without further ado",
  "let's dive in",
  "let's explore",
  "as we all know",
  "needless to say",
  "in the digital era",
  "revolutionize the way",
  "cutting-edge",
  "state-of-the-art",
  "holistic approach",
  "myriad of",
  "plethora of",
  "tapestry of",
  "in a nutshell",
];

export async function seedBannedPhrasesIfEmpty(): Promise<void> {
  const existing = await db.select({ id: bannedPhrasesTable.id }).from(bannedPhrasesTable).limit(1);
  if (existing.length > 0) return;
  await db
    .insert(bannedPhrasesTable)
    .values(DEFAULT_BANNED_PHRASES.map((phrase) => ({ phrase, category: "ai_cliche" })))
    .onConflictDoNothing();
}

export async function getActiveBannedPhrases(): Promise<string[]> {
  await seedBannedPhrasesIfEmpty();
  const rows = await db
    .select({ phrase: bannedPhrasesTable.phrase })
    .from(bannedPhrasesTable)
    .where(eq(bannedPhrasesTable.active, true));
  return rows.map((r) => r.phrase);
}

/** Case-insensitive scan of plain text for any banned phrase. Returns the hits found. */
export function scanForBannedPhrases(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase.toLowerCase()));
}
