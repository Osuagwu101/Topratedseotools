import type { RequestHandler } from "express";
import { db, protectedDatasetsTable, protectedDataUnlockLogTable, type StaffUser } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Registry of business-critical datasets that are protected by default.
 * Adding a new key here is enough to protect it — rows are seeded lazily on
 * first read (see ensureSeeded) rather than requiring a migration.
 */
export interface ProtectedDatasetDefinition {
  key: string;
  label: string;
  description: string;
}

export const PROTECTED_DATASETS: ProtectedDatasetDefinition[] = [
  { key: "users", label: "Users", description: "Customer accounts and device sessions." },
  { key: "products", label: "Products", description: "Product catalog and tool server records." },
  { key: "orders_purchases", label: "Orders & Purchases", description: "Orders and purchase records." },
  { key: "payment_history", label: "Payment History", description: "Payment and transaction records." },
  { key: "downloads", label: "Downloads", description: "Downloadable files and storage uploads." },
  { key: "subscriptions", label: "Subscriptions", description: "Subscription and tool entitlement records." },
  { key: "coupons", label: "Coupons", description: "Coupons and discount codes." },
  { key: "referral_data", label: "Referral Data", description: "Referral program signups and rewards." },
  { key: "website_settings", label: "Website Settings", description: "Site, homepage, and feature-flag settings." },
  { key: "payment_settings", label: "Payment Settings", description: "Payment gateway configuration." },
  { key: "email_settings", label: "Email Settings", description: "Email service configuration." },
  { key: "ai_settings", label: "AI Settings", description: "AI content generator configuration." },
  { key: "analytics", label: "Analytics", description: "Analytics and tracking data." },
  { key: "audit_system_logs", label: "Audit & System Logs", description: "Audit trail and system configuration logs." },
];

const definitionsByKey = new Map(PROTECTED_DATASETS.map((d) => [d.key, d]));

export function getDatasetDefinition(key: string): ProtectedDatasetDefinition | undefined {
  return definitionsByKey.get(key);
}

// Unlocks are time-boxed so a forgotten "Unlock" never leaves a dataset
// exposed indefinitely — it auto-relocks after this window even if nobody
// clicks "Relock" manually.
const UNLOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ datasetKey: protectedDatasetsTable.datasetKey }).from(protectedDatasetsTable);
  const existingKeys = new Set(existing.map((r) => r.datasetKey));
  const missing = PROTECTED_DATASETS.filter((d) => !existingKeys.has(d.key));
  if (missing.length === 0) return;
  await db
    .insert(protectedDatasetsTable)
    .values(missing.map((d) => ({ datasetKey: d.key })))
    .onConflictDoNothing();
}

export type DatasetLogAction = "unlocked" | "relocked" | "auto_relocked" | "blocked_attempt" | "allowed_attempt";

async function writeLog(entry: {
  datasetKey: string;
  action: DatasetLogAction;
  actor?: StaffUser | undefined;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(protectedDataUnlockLogTable).values({
    datasetKey: entry.datasetKey,
    action: entry.action,
    staffUserId: entry.actor?.id ?? null,
    staffEmail: entry.actor?.email ?? null,
    staffName: entry.actor?.name ?? null,
    reason: entry.reason ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

/**
 * Shared audit-log writer, exported for other centres (e.g. Deployment
 * Safety) that need to record events against this same append-only log —
 * keeps every protected-dataset event (unlock/relock/blocked/allowed risky
 * operation) in one searchable place instead of fragmenting the audit trail.
 */
export async function recordDatasetEvent(entry: {
  datasetKey: string;
  action: DatasetLogAction;
  actor?: StaffUser | undefined;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  await writeLog(entry);
}

/** Relocks a row in-place if its unlock window has expired. Returns the (possibly updated) row. */
async function autoRelockIfExpired(row: typeof protectedDatasetsTable.$inferSelect) {
  if (row.locked) return row;
  if (!row.unlockExpiresAt || row.unlockExpiresAt.getTime() > Date.now()) return row;
  const now = new Date();
  const [updated] = await db
    .update(protectedDatasetsTable)
    .set({ locked: true, relockedAt: now, updatedAt: now })
    .where(eq(protectedDatasetsTable.id, row.id))
    .returning();
  await writeLog({ datasetKey: row.datasetKey, action: "auto_relocked" });
  logger.info({ datasetKey: row.datasetKey }, "Protected dataset auto-relocked after its unlock window expired");
  return updated ?? row;
}

export interface DatasetStatus {
  key: string;
  label: string;
  description: string;
  locked: boolean;
  unlockedByEmail: string | null;
  unlockReason: string | null;
  unlockedAt: string | null;
  unlockExpiresAt: string | null;
  relockedAt: string | null;
}

export async function listDatasetStatuses(): Promise<DatasetStatus[]> {
  await ensureSeeded();
  const rows = await db.select().from(protectedDatasetsTable);
  const resolved = await Promise.all(rows.map(autoRelockIfExpired));
  const byKey = new Map(resolved.map((r) => [r.datasetKey, r]));
  return PROTECTED_DATASETS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      locked: row?.locked ?? true,
      unlockedByEmail: row?.unlockedByEmail ?? null,
      unlockReason: row?.unlockReason ?? null,
      unlockedAt: row?.unlockedAt?.toISOString() ?? null,
      unlockExpiresAt: row?.unlockExpiresAt?.toISOString() ?? null,
      relockedAt: row?.relockedAt?.toISOString() ?? null,
    };
  });
}

async function getRow(key: string) {
  await ensureSeeded();
  const [row] = await db.select().from(protectedDatasetsTable).where(eq(protectedDatasetsTable.datasetKey, key)).limit(1);
  return row ?? null;
}

/** True if the dataset is currently unlocked (and not past its auto-relock window). */
export async function isDatasetUnlocked(key: string): Promise<boolean> {
  const row = await getRow(key);
  if (!row) return false;
  const resolved = await autoRelockIfExpired(row);
  return !resolved.locked;
}

export async function unlockDataset(
  key: string,
  reason: string,
  actor: StaffUser | undefined,
  ipAddress?: string | null,
): Promise<DatasetStatus> {
  const def = getDatasetDefinition(key);
  if (!def) throw new Error(`Unknown protected dataset: ${key}`);
  if (!reason.trim()) throw new Error("A reason is required to unlock a protected dataset.");
  await ensureSeeded();
  const now = new Date();
  await db
    .update(protectedDatasetsTable)
    .set({
      locked: false,
      unlockedByStaffId: actor?.id ?? null,
      unlockedByEmail: actor?.email ?? null,
      unlockReason: reason.trim(),
      unlockedAt: now,
      unlockExpiresAt: new Date(now.getTime() + UNLOCK_DURATION_MS),
      relockedAt: null,
      updatedAt: now,
    })
    .where(eq(protectedDatasetsTable.datasetKey, key));
  await writeLog({ datasetKey: key, action: "unlocked", actor, reason: reason.trim(), ipAddress });
  logger.info({ staffId: actor?.id, datasetKey: key }, "Protected dataset unlocked");
  const statuses = await listDatasetStatuses();
  return statuses.find((s) => s.key === key)!;
}

export async function relockDataset(
  key: string,
  actor: StaffUser | undefined,
  ipAddress?: string | null,
): Promise<DatasetStatus> {
  const def = getDatasetDefinition(key);
  if (!def) throw new Error(`Unknown protected dataset: ${key}`);
  await ensureSeeded();
  const now = new Date();
  await db
    .update(protectedDatasetsTable)
    .set({ locked: true, relockedAt: now, updatedAt: now })
    .where(eq(protectedDatasetsTable.datasetKey, key));
  await writeLog({ datasetKey: key, action: "relocked", actor, ipAddress });
  logger.info({ staffId: actor?.id, datasetKey: key }, "Protected dataset relocked");
  const statuses = await listDatasetStatuses();
  return statuses.find((s) => s.key === key)!;
}

export async function listUnlockLog(limit = 200) {
  return db.select().from(protectedDataUnlockLogTable).orderBy(desc(protectedDataUnlockLogTable.createdAt)).limit(limit);
}

/**
 * Reusable guard for any admin route that performs a destructive/bulk write
 * against a protected dataset. Responds 423 Locked (and logs the blocked
 * attempt) unless the dataset has been explicitly unlocked and is still
 * within its unlock window.
 */
export function requireDatasetUnlocked(key: string): RequestHandler {
  return async (req, res, next) => {
    try {
      if (await isDatasetUnlocked(key)) {
        next();
        return;
      }
      const def = getDatasetDefinition(key);
      await writeLog({ datasetKey: key, action: "blocked_attempt", actor: req.staffUser, ipAddress: req.ip });
      res.status(423).json({
        error: `"${def?.label ?? key}" is protected and locked. Unlock it from the Protected Data centre before retrying.`,
      });
    } catch (err) {
      logger.error({ err, datasetKey: key }, "Failed to evaluate protected-dataset lock");
      res.status(500).json({ error: "Failed to check protected-data lock status." });
    }
  };
}
