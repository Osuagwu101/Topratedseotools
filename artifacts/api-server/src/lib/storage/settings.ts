import { db, storageSettingsTable, type StorageSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

export type { StorageSettings };
export type StorageBackendKind = "replit" | "s3" | "local";

async function readRow(): Promise<StorageSettings | undefined> {
  const rows = await db.select().from(storageSettingsTable).where(eq(storageSettingsTable.id, 1));
  return rows[0];
}

/**
 * Default backend when no settings row exists yet: "replit" if this looks
 * like a Replit workspace (the sidecar env vars are present), otherwise
 * "local" so a fresh non-Replit deployment works out of the box without
 * requiring an admin to configure anything before the first upload.
 */
function defaultBackendForEnvironment(): StorageBackendKind {
  if (process.env.PUBLIC_OBJECT_SEARCH_PATHS && process.env.REPL_ID) return "replit";
  return "local";
}

export async function ensureStorageSettings(): Promise<StorageSettings> {
  const existing = await readRow();
  if (existing) return existing;
  await db
    .insert(storageSettingsTable)
    .values({ id: 1, backend: defaultBackendForEnvironment() })
    .onConflictDoNothing();
  const row = await readRow();
  if (!row) throw new Error("Failed to create default storage settings row");
  return row;
}

// Small in-memory cache, same convention as paymentSettings.ts — every write
// path below invalidates it immediately so admin changes take effect on the
// very next request, not after the TTL.
let cached: { value: StorageSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getStorageSettings(): Promise<StorageSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const settings = await ensureStorageSettings();
  cached = { value: settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

export function invalidateStorageSettingsCache(): void {
  cached = null;
}

export async function updateStorageSettings(
  patch: Partial<typeof storageSettingsTable.$inferInsert>,
  actorEmail: string | undefined,
): Promise<StorageSettings> {
  await ensureStorageSettings();
  await db
    .update(storageSettingsTable)
    .set({ ...patch, updatedAt: new Date(), updatedByEmail: actorEmail ?? null })
    .where(eq(storageSettingsTable.id, 1));
  invalidateStorageSettingsCache();
  const row = await readRow();
  if (!row) throw new Error("Storage settings row disappeared after update");
  return row;
}
