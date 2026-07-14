import { db, productsTable } from "@workspace/db";
import { invalidatePaymentSettingsCache, getPaymentSettings } from "./paymentSettings";
import { invalidateEmailSettingsCache, getEmailSettings } from "./emailSettings";
import { invalidateReferralSettingsCache, getReferralSettings } from "./referralSettings";
import { invalidateStorageCache, getStorageSummary } from "./storageAdmin";

export interface CacheActionResult {
  action: string;
  detail: string;
}

/**
 * Every in-memory cache this app maintains, in one place, so Cache &
 * Maintenance actions (and Emergency Recovery's "Refresh API Connections")
 * stay correct as new caches are added elsewhere. Each entry's `clear`
 * drops the cached value; `warm` immediately re-populates it so "Rebuild
 * Cache" leaves the next request fast instead of paying the miss cost.
 */
const REGISTRY: { key: string; label: string; clear: () => void; warm: () => Promise<unknown> }[] = [
  { key: "payment_settings", label: "Payment settings", clear: invalidatePaymentSettingsCache, warm: getPaymentSettings },
  { key: "email_settings", label: "Email settings", clear: invalidateEmailSettingsCache, warm: getEmailSettings },
  { key: "referral_settings", label: "Referral settings", clear: invalidateReferralSettingsCache, warm: getReferralSettings },
  { key: "storage_summary", label: "Storage listing", clear: invalidateStorageCache, warm: () => getStorageSummary(true) },
];

export function clearAllCaches(): CacheActionResult {
  for (const entry of REGISTRY) entry.clear();
  return { action: "clear", detail: `Cleared ${REGISTRY.length} in-memory caches (${REGISTRY.map((r) => r.label).join(", ")}).` };
}

export async function rebuildAllCaches(): Promise<CacheActionResult> {
  for (const entry of REGISTRY) entry.clear();
  const results = await Promise.allSettled(REGISTRY.map((entry) => entry.warm()));
  const failed = results.filter((r) => r.status === "rejected").length;
  return {
    action: "rebuild",
    detail:
      failed === 0
        ? `Rebuilt all ${REGISTRY.length} caches from the database.`
        : `Rebuilt ${REGISTRY.length - failed}/${REGISTRY.length} caches — ${failed} failed and will rebuild lazily on next use.`,
  };
}

/**
 * "Refresh Products": there is no server-side product cache today — every
 * storefront request reads productsTable directly (see routes/products.ts).
 * Rather than fake an invalidation that does nothing, this verifies the
 * catalog is actually reachable and reports its current size, which is the
 * real, honest thing this action can confirm.
 */
export async function refreshProducts(): Promise<CacheActionResult> {
  const rows = await db.select({ id: productsTable.id, isHidden: productsTable.isHidden, isDeleted: productsTable.isDeleted }).from(productsTable);
  const visible = rows.filter((r) => !r.isHidden && !r.isDeleted).length;
  return {
    action: "refresh_products",
    detail: `Products are read live from the database on every request (no cache to clear). Catalog currently has ${visible} visible product(s) of ${rows.length} total.`,
  };
}

/**
 * "Refresh AI Configuration": the AI generator reads its settings row and
 * provider clients live on every call (see aiHealth.ts / seoGenerator/*),
 * so there is nothing cached to invalidate. This re-runs the AI health
 * check so admins get a fresh read right after rotating a key.
 */
export async function refreshAiConfiguration(): Promise<CacheActionResult> {
  const { getAiHealth } = await import("./aiHealth");
  const health = await getAiHealth();
  return {
    action: "refresh_ai",
    detail: `AI provider settings are read live (no cache to clear). Current status: ${health.status}.`,
  };
}

/**
 * "Refresh Website": clears every settings-style cache that feeds the
 * public storefront (payment/email/referral settings, storage listing) so
 * any admin edit is guaranteed visible on the very next page load.
 */
export async function refreshWebsite(): Promise<CacheActionResult> {
  const result = clearAllCaches();
  return { action: "refresh_website", detail: `Refreshed the storefront's cached configuration. ${result.detail}` };
}
