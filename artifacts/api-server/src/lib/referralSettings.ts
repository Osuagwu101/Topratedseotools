import { db, referralSettingsTable, type ReferralSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

let cache: ReferralSettings | null = null;

export function invalidateReferralSettingsCache(): void {
  cache = null;
}

export async function ensureReferralSettings(): Promise<ReferralSettings> {
  const rows = await db.select().from(referralSettingsTable).where(eq(referralSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(referralSettingsTable).values({ id: 1 }).onConflictDoNothing();
    const created = await db.select().from(referralSettingsTable).where(eq(referralSettingsTable.id, 1));
    return created[0];
  }
  return rows[0];
}

export async function getReferralSettings(): Promise<ReferralSettings> {
  if (cache) return cache;
  cache = await ensureReferralSettings();
  return cache;
}

export async function updateReferralSettings(
  patch: Partial<typeof referralSettingsTable.$inferInsert>,
  actorEmail: string | undefined,
): Promise<ReferralSettings> {
  await ensureReferralSettings();
  await db
    .update(referralSettingsTable)
    .set({ ...patch, updatedAt: new Date(), updatedBy: actorEmail ?? "admin" })
    .where(eq(referralSettingsTable.id, 1));
  invalidateReferralSettingsCache();
  return getReferralSettings();
}
