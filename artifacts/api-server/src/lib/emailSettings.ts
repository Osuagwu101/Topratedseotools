import { db, emailSettingsTable, type EmailSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

export type { EmailSettings };

async function readRow(): Promise<EmailSettings | undefined> {
  const rows = await db.select().from(emailSettingsTable).where(eq(emailSettingsTable.id, 1));
  return rows[0];
}

export async function ensureEmailSettings(): Promise<EmailSettings> {
  const existing = await readRow();
  if (existing) return existing;
  await db.insert(emailSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const row = await readRow();
  if (!row) throw new Error("Failed to create default email settings row");
  return row;
}

// Small in-memory cache, mirroring paymentSettings.ts -- every write path
// below invalidates immediately, so admin changes take effect on the very
// next request, not after the TTL.
let cached: { value: EmailSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getEmailSettings(): Promise<EmailSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const settings = await ensureEmailSettings();
  cached = { value: settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

export function invalidateEmailSettingsCache(): void {
  cached = null;
}

export async function updateEmailSettings(
  patch: Partial<typeof emailSettingsTable.$inferInsert>,
  actorEmail: string | undefined,
): Promise<EmailSettings> {
  await ensureEmailSettings();
  await db
    .update(emailSettingsTable)
    .set({ ...patch, updatedAt: new Date(), updatedByEmail: actorEmail ?? null })
    .where(eq(emailSettingsTable.id, 1));
  invalidateEmailSettingsCache();
  const row = await readRow();
  if (!row) throw new Error("Email settings row disappeared after update");
  return row;
}

export async function recordTestEmailResult(
  ok: boolean,
  message: string,
  sentTo: string,
): Promise<void> {
  await ensureEmailSettings();
  await db
    .update(emailSettingsTable)
    .set({
      lastTestSentAt: new Date(),
      lastTestSentToEmail: sentTo,
      lastTestResultOk: ok,
      lastTestResultMessage: message,
    })
    .where(eq(emailSettingsTable.id, 1));
  invalidateEmailSettingsCache();
}
