import { db, paymentSettingsTable, type PaymentSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

export type { PaymentSettings };

// Paystack's officially supported settlement currencies for this integration.
export const SUPPORTED_CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR"] as const;

async function readRow(): Promise<PaymentSettings | undefined> {
  const rows = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.id, 1));
  return rows[0];
}

export async function ensurePaymentSettings(): Promise<PaymentSettings> {
  const existing = await readRow();
  if (existing) return existing;
  await db.insert(paymentSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const row = await readRow();
  if (!row) throw new Error("Failed to create default payment settings row");
  return row;
}

// Small in-memory cache so the hot checkout path (order creation, one lookup
// per order) doesn't hit the DB on every request. TTL is a safety net only —
// every write path below calls invalidatePaymentSettingsCache() immediately,
// so admin changes take effect on the very next request, not after the TTL.
let cached: { value: PaymentSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const settings = await ensurePaymentSettings();
  cached = { value: settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

export function invalidatePaymentSettingsCache(): void {
  cached = null;
}

export async function updatePaymentSettings(
  patch: Partial<typeof paymentSettingsTable.$inferInsert>,
  actorEmail: string | undefined,
): Promise<PaymentSettings> {
  await ensurePaymentSettings();
  await db
    .update(paymentSettingsTable)
    .set({ ...patch, updatedAt: new Date(), updatedByEmail: actorEmail ?? null })
    .where(eq(paymentSettingsTable.id, 1));
  invalidatePaymentSettingsCache();
  const row = await readRow();
  if (!row) throw new Error("Payment settings row disappeared after update");
  return row;
}

export async function recordWebhookReceived(): Promise<void> {
  await ensurePaymentSettings();
  await db
    .update(paymentSettingsTable)
    .set({ lastWebhookReceivedAt: new Date() })
    .where(eq(paymentSettingsTable.id, 1));
  invalidatePaymentSettingsCache();
}

/**
 * The Paystack secret key actually in effect right now, given the current
 * test/live mode. Read live from process.env (never cached at module scope —
 * see systemConfig.ts) so an admin rotating the key takes effect immediately.
 */
export function resolveActivePaystackSecretKey(settings: Pick<PaymentSettings, "testMode">): string {
  if (settings.testMode) {
    const testKey = process.env.PAYSTACK_TEST_SECRET_KEY;
    if (testKey) return testKey;
  }
  return process.env.PAYSTACK_SECRET_KEY ?? process.env.PAYSTACK_API_KEY ?? "";
}

/**
 * Repairs invalid stored values (negative numbers, min > max, unsupported
 * currency) back to safe defaults. Returns what, if anything, was fixed.
 */
export async function repairPaymentSettings(actorEmail: string | undefined): Promise<{ changes: string[] }> {
  const settings = await ensurePaymentSettings();
  const changes: string[] = [];
  const patch: Partial<typeof paymentSettingsTable.$inferInsert> = {};

  if (settings.taxPercent < 0) {
    patch.taxPercent = 0;
    changes.push("Reset negative tax percentage to 0%.");
  }
  if (settings.feePercent < 0) {
    patch.feePercent = 0;
    changes.push("Reset negative processing fee percentage to 0%.");
  }
  if (settings.feeFlatKobo < 0) {
    patch.feeFlatKobo = 0;
    changes.push("Reset negative flat processing fee to 0.");
  }
  if (settings.minPurchaseKobo < 0) {
    patch.minPurchaseKobo = 0;
    changes.push("Reset negative minimum purchase amount to 0.");
  }
  if (settings.maxPurchaseKobo != null && settings.maxPurchaseKobo < 0) {
    patch.maxPurchaseKobo = null;
    changes.push("Cleared an invalid negative maximum purchase amount.");
  }
  const effectiveMax = patch.maxPurchaseKobo !== undefined ? patch.maxPurchaseKobo : settings.maxPurchaseKobo;
  const effectiveMin = patch.minPurchaseKobo !== undefined ? patch.minPurchaseKobo : settings.minPurchaseKobo;
  if (effectiveMax != null && effectiveMin > effectiveMax) {
    patch.maxPurchaseKobo = null;
    changes.push("Cleared the maximum purchase amount because it was lower than the minimum.");
  }
  if (!SUPPORTED_CURRENCIES.includes(settings.currency as (typeof SUPPORTED_CURRENCIES)[number])) {
    patch.currency = "NGN";
    changes.push(`Unsupported currency "${settings.currency}" reset to NGN.`);
  }

  if (Object.keys(patch).length > 0) {
    await db
      .update(paymentSettingsTable)
      .set({ ...patch, updatedAt: new Date(), updatedByEmail: actorEmail ?? null })
      .where(eq(paymentSettingsTable.id, 1));
    invalidatePaymentSettingsCache();
  }

  return { changes };
}
