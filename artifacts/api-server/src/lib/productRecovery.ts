import {
  db,
  productsTable,
  ordersTable,
  toolServersTable,
  toolAssignmentsTable,
  toolEntitlementsTable,
  reviewsTable,
  couponsTable,
  blogPostsTable,
  referralSettingsTable,
  backupsTable,
  productRecoveryLogTable,
  type StaffUser,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";
import { isDatasetUnlocked, getDatasetDefinition } from "./protectedData";
import { loadEnvelope } from "./restoreEngine";
import { runScan, repairFinding, type IntegrityReport } from "./dbIntegrity";
import { refreshProducts as refreshProductsCache } from "./cacheMaintenance";

export interface ProductRecoveryResult {
  action: string;
  status: "ok" | "blocked" | "partial";
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  detail?: Record<string, unknown>;
}

async function writeLog(entry: {
  action: string;
  status: ProductRecoveryResult["status"];
  summary: Record<string, unknown>;
  actor: StaffUser | undefined;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(productRecoveryLogTable).values({
    action: entry.action,
    status: entry.status,
    summary: entry.summary,
    staffUserId: entry.actor?.id ?? null,
    staffEmail: entry.actor?.email ?? null,
    staffName: entry.actor?.name ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

const PRODUCTS_DATASET = "products";

/** Every product row currently in the database, including soft-deleted ones (they still count as "present"). */
async function loadAllProducts() {
  return db.select().from(productsTable).orderBy(productsTable.id);
}

// ---------------------------------------------------------------- 1. RELOAD

/**
 * Read-only health check: re-reads the catalog straight from the database
 * (there's no server-side product cache to go stale — see refreshProducts
 * in cacheMaintenance.ts) and reports its current shape, grouped by
 * visibility and category, so an admin can confirm the catalog looks right
 * after any change elsewhere.
 */
export async function reloadProducts(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult> {
  const products = await loadAllProducts();
  const visible = products.filter((p) => !p.isHidden && !p.isDeleted).length;
  const hidden = products.filter((p) => p.isHidden && !p.isDeleted).length;
  const deleted = products.filter((p) => p.isDeleted).length;
  const byCategory: Record<string, number> = {};
  for (const p of products) {
    if (p.isDeleted) continue;
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  }
  const summary = { total: products.length, visible, hidden, deleted, byCategory };
  await writeLog({ action: "reload", status: "ok", summary, actor, ipAddress });
  return {
    action: "reload",
    status: "ok",
    message: `Reloaded ${products.length} product row(s) directly from the database: ${visible} visible, ${hidden} hidden, ${deleted} soft-deleted.`,
    after: summary,
  };
}

// -------------------------------------------------------- 2. RESTORE MISSING

interface MissingProductRef {
  productId: number;
  referencedBy: string[];
}

/**
 * Every place a product id is referenced elsewhere in the schema. A row
 * whose id shows up here but not in the live products table is "missing" —
 * this never looks at orders' own rows for restoration (only uses them to
 * detect *which* product ids are missing), so an order is never touched.
 */
async function findMissingProductIds(): Promise<MissingProductRef[]> {
  const [products, orders, servers, assignments, entitlements, reviews, coupons, blogPosts, referralSettings] = await Promise.all([
    loadAllProducts(),
    db.select({ productId: ordersTable.productId }).from(ordersTable),
    db.select({ productId: toolServersTable.productId }).from(toolServersTable),
    db.select({ productId: toolAssignmentsTable.productId }).from(toolAssignmentsTable),
    db.select({ productId: toolEntitlementsTable.productId }).from(toolEntitlementsTable),
    db.select({ productId: reviewsTable.productId }).from(reviewsTable),
    db.select({ productIds: couponsTable.productIds }).from(couponsTable),
    db.select({ ctaProductId: blogPostsTable.ctaProductId }).from(blogPostsTable),
    db.select({ rewardProductId: referralSettingsTable.rewardProductId }).from(referralSettingsTable),
  ]);
  const existingIds = new Set(products.map((p) => p.id));
  const refs = new Map<number, Set<string>>();
  const addRef = (id: number | null | undefined, source: string) => {
    if (id == null || existingIds.has(id)) return;
    if (!refs.has(id)) refs.set(id, new Set());
    refs.get(id)!.add(source);
  };
  for (const r of orders) addRef(r.productId, "orders");
  for (const r of servers) addRef(r.productId, "tool_servers");
  for (const r of assignments) addRef(r.productId, "tool_assignments");
  for (const r of entitlements) addRef(r.productId, "tool_entitlements");
  for (const r of reviews) addRef(r.productId, "reviews");
  for (const r of coupons) for (const id of r.productIds) addRef(id, "coupons");
  for (const r of blogPosts) addRef(r.ctaProductId, "blog_posts");
  for (const r of referralSettings) addRef(r.rewardProductId, "referral_settings");
  return [...refs.entries()].map(([productId, sources]) => ({ productId, referencedBy: [...sources] }));
}

/**
 * Attempts to bring back product rows that other tables still reference but
 * that no longer exist in the products table. The only place product data
 * can be recovered from is a completed "products"-scope backup (Task 3) —
 * this never fabricates a product, and never touches the referencing rows
 * (orders, entitlements, etc.) themselves, so existing purchases are
 * unaffected either way.
 */
export async function restoreMissingProducts(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult> {
  const missing = await findMissingProductIds();
  if (missing.length === 0) {
    const summary = { missingCount: 0 };
    await writeLog({ action: "restore_missing", status: "ok", summary, actor, ipAddress });
    return { action: "restore_missing", status: "ok", message: "No missing products found — every product id referenced elsewhere still exists.", before: summary, after: summary };
  }

  if (!(await isDatasetUnlocked(PRODUCTS_DATASET))) {
    const def = getDatasetDefinition(PRODUCTS_DATASET);
    const message = `"${def?.label ?? PRODUCTS_DATASET}" is protected and locked. Unlock it from the Protected Data centre before restoring missing products.`;
    await writeLog({ action: "restore_missing", status: "blocked", summary: { missingCount: missing.length, error: message }, actor, ipAddress });
    return { action: "restore_missing", status: "blocked", message, before: { missingCount: missing.length } };
  }

  // Walk backups newest-first until we find one that completed successfully.
  const candidates = await db.select().from(backupsTable).where(eq(backupsTable.scope, "products")).orderBy(desc(backupsTable.createdAt)).limit(20);
  const usable = candidates.find((b) => b.status === "completed" && b.storagePath);

  if (!usable) {
    const message = "No completed products-scope backup exists to restore from. Run a Products backup first (Backup Centre), or recreate these products manually.";
    await writeLog({ action: "restore_missing", status: "partial", summary: { missingCount: missing.length, missingIds: missing.map((m) => m.productId), error: message }, actor, ipAddress });
    return {
      action: "restore_missing",
      status: "partial",
      message,
      before: { missingCount: missing.length },
      detail: { missing },
    };
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = await loadEnvelope(usable.storagePath!);
  } catch (err) {
    const message = `Backup #${usable.id} is recorded as completed, but its stored file could not be read (${err instanceof Error ? err.message : String(err)}). These product(s) will need to be recreated manually.`;
    await writeLog({ action: "restore_missing", status: "partial", summary: { missingCount: missing.length, missingIds: missing.map((m) => m.productId), sourceBackupId: usable.id, error: message }, actor, ipAddress });
    return {
      action: "restore_missing",
      status: "partial",
      message,
      before: { missingCount: missing.length, missingIds: missing.map((m) => m.productId) },
      detail: { missing },
    };
  }
  const backupProducts = ((envelope as { tables?: { products?: Record<string, unknown>[] } }).tables?.products ?? []) as Record<string, unknown>[];
  const backupById = new Map(backupProducts.map((r) => [r.id as number, r]));

  const restored: number[] = [];
  const stillMissing: number[] = [];
  for (const { productId } of missing) {
    const row = backupById.get(productId);
    if (!row) {
      stillMissing.push(productId);
      continue;
    }
    await db.insert(productsTable).values(row as never).onConflictDoNothing({ target: productsTable.id });
    restored.push(productId);
  }

  const summary = {
    missingCount: missing.length,
    restoredCount: restored.length,
    restoredIds: restored,
    stillMissingIds: stillMissing,
    sourceBackupId: usable.id,
    sourceBackupCreatedAt: usable.createdAt.toISOString(),
  };
  const status: ProductRecoveryResult["status"] = stillMissing.length > 0 ? "partial" : "ok";
  await writeLog({ action: "restore_missing", status, summary, actor, ipAddress });
  return {
    action: "restore_missing",
    status,
    message:
      restored.length > 0
        ? `Restored ${restored.length} product(s) from backup #${usable.id}${stillMissing.length > 0 ? `; ${stillMissing.length} could not be recovered (not present in that backup)` : ""}.`
        : `None of the ${missing.length} missing product(s) were found in backup #${usable.id} — they'll need to be recreated manually.`,
    before: { missingCount: missing.length, missingIds: missing.map((m) => m.productId) },
    after: summary,
    detail: { missing },
  };
}

// ------------------------------------------------------------ 3. REBUILD INDEX

/**
 * Normalizes each product's cross-sell/up-sell/down-sell arrays: removes
 * duplicate entries and any id that references the product itself (which
 * would otherwise render a tool as its own recommendation). Never removes an
 * id just because a *target* product looks unhealthy — that's Repair
 * Product Relationships' job — this only cleans up the arrays' own shape.
 */
export async function rebuildProductIndex(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult> {
  if (!(await isDatasetUnlocked(PRODUCTS_DATASET))) {
    const def = getDatasetDefinition(PRODUCTS_DATASET);
    const message = `"${def?.label ?? PRODUCTS_DATASET}" is protected and locked. Unlock it from the Protected Data centre before rebuilding the product index.`;
    await writeLog({ action: "rebuild_index", status: "blocked", summary: { error: message }, actor, ipAddress });
    return { action: "rebuild_index", status: "blocked", message };
  }

  const products = await loadAllProducts();
  const clean = (ids: number[], selfId: number) => [...new Set(ids.filter((id) => id !== selfId))];
  let changedCount = 0;
  const changes: Record<string, unknown>[] = [];
  for (const p of products) {
    const nextCross = clean(p.crossSellProductIds, p.id);
    const nextUp = clean(p.upSellProductIds, p.id);
    const nextDown = clean(p.downSellProductIds, p.id);
    const changed =
      nextCross.length !== p.crossSellProductIds.length ||
      nextUp.length !== p.upSellProductIds.length ||
      nextDown.length !== p.downSellProductIds.length;
    if (!changed) continue;
    await db
      .update(productsTable)
      .set({ crossSellProductIds: nextCross, upSellProductIds: nextUp, downSellProductIds: nextDown })
      .where(eq(productsTable.id, p.id));
    changedCount++;
    changes.push({ productId: p.id, before: { cross: p.crossSellProductIds, up: p.upSellProductIds, down: p.downSellProductIds }, after: { cross: nextCross, up: nextUp, down: nextDown } });
  }

  const summary = { scanned: products.length, changed: changedCount, changes };
  await writeLog({ action: "rebuild_index", status: "ok", summary, actor, ipAddress });
  return {
    action: "rebuild_index",
    status: "ok",
    message: changedCount === 0 ? `Scanned ${products.length} product(s) — recommendation arrays were already clean.` : `Rebuilt recommendation arrays on ${changedCount} of ${products.length} product(s) (removed duplicate/self-referencing ids).`,
    before: { scanned: products.length },
    after: summary,
  };
}

// -------------------------------------------------------------- 4. VERIFY

/** The Database Integrity Checker's checks that touch product-referencing tables. */
export const PRODUCT_CHECK_KEYS = [
  "orders_missing_product",
  "tool_servers_missing_product",
  "tool_assignments_missing_product",
  "entitlements_missing_product",
  "coupons_invalid_product_ids",
  "usage_missing_product",
];

/**
 * Runs the subset of the Database Integrity Checker's scan that's relevant
 * to products — every check whose table references productId — so admins
 * don't have to run the full site-wide scan just to check the catalog.
 * Purely diagnostic; never writes anything.
 */
export async function verifyProductDatabase(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult & { report: IntegrityReport }> {
  const report = await runScan(actor, ipAddress, { checkKeys: PRODUCT_CHECK_KEYS });
  const summary = { totalFindings: report.totalFindings, findingKeys: report.findings.map((f) => f.key) };
  await writeLog({ action: "verify", status: "ok", summary, actor, ipAddress });
  return {
    action: "verify",
    status: "ok",
    message: report.totalFindings === 0 ? "No product-related integrity issues found." : `Found ${report.totalFindings} product-related issue(s) across ${report.findings.length} check(s).`,
    after: summary,
    report,
  };
}

// ---------------------------------------------------------- 5. REPAIR RELATIONSHIPS

/**
 * Fixes the product-relationship problems that have an unambiguous safe fix:
 * strips dead ids (pointing at a deleted/missing product) out of every
 * product's own cross/up/down-sell arrays, and — reusing the Database
 * Integrity Checker's own repair — strips dead product ids out of coupon
 * scoping arrays. Never deletes a product, order, or entitlement row.
 */
export async function repairProductRelationships(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult> {
  if (!(await isDatasetUnlocked(PRODUCTS_DATASET))) {
    const def = getDatasetDefinition(PRODUCTS_DATASET);
    const message = `"${def?.label ?? PRODUCTS_DATASET}" is protected and locked. Unlock it from the Protected Data centre before repairing product relationships.`;
    await writeLog({ action: "repair_relationships", status: "blocked", summary: { error: message }, actor, ipAddress });
    return { action: "repair_relationships", status: "blocked", message };
  }

  const products = await loadAllProducts();
  const validIds = new Set(products.map((p) => p.id));
  let sellArraysFixed = 0;
  const sellChanges: Record<string, unknown>[] = [];
  for (const p of products) {
    const nextCross = p.crossSellProductIds.filter((id) => validIds.has(id));
    const nextUp = p.upSellProductIds.filter((id) => validIds.has(id));
    const nextDown = p.downSellProductIds.filter((id) => validIds.has(id));
    const changed = nextCross.length !== p.crossSellProductIds.length || nextUp.length !== p.upSellProductIds.length || nextDown.length !== p.downSellProductIds.length;
    if (!changed) continue;
    await db.update(productsTable).set({ crossSellProductIds: nextCross, upSellProductIds: nextUp, downSellProductIds: nextDown }).where(eq(productsTable.id, p.id));
    sellArraysFixed++;
    sellChanges.push({ productId: p.id, removedFromCross: p.crossSellProductIds.filter((id) => !validIds.has(id)), removedFromUp: p.upSellProductIds.filter((id) => !validIds.has(id)), removedFromDown: p.downSellProductIds.filter((id) => !validIds.has(id)) });
  }

  let couponOutcome: { status: string; repairedCount?: number; error?: string } = { status: "not_run" };
  try {
    const outcome = await repairFinding("coupons_invalid_product_ids", actor, ipAddress);
    couponOutcome = outcome.status === "repaired" ? { status: "repaired", repairedCount: outcome.repairedCount } : { status: outcome.status, error: (outcome as { error?: string }).error };
  } catch (err) {
    couponOutcome = { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  const summary = { sellArraysFixed, sellChanges, couponRelinking: couponOutcome };
  const status: ProductRecoveryResult["status"] = couponOutcome.status === "blocked" ? "partial" : "ok";
  await writeLog({ action: "repair_relationships", status, summary, actor, ipAddress });
  return {
    action: "repair_relationships",
    status,
    message: `Cleaned dangling product references from ${sellArraysFixed} product(s)' recommendation arrays. Coupon-to-product links: ${couponOutcome.status}${couponOutcome.repairedCount != null ? ` (${couponOutcome.repairedCount} fixed)` : ""}.`,
    after: summary,
  };
}

// -------------------------------------------------------------- 6. REFRESH CACHE

/**
 * There is no server-side product cache to invalidate today — every
 * storefront/admin request reads the products table live. Reuses the
 * Cache & Maintenance Centre's own honest check so this action reports the
 * same real thing rather than a fake "cache cleared" message.
 */
export async function refreshProductCache(actor: StaffUser | undefined, ipAddress?: string | null): Promise<ProductRecoveryResult> {
  const result = await refreshProductsCache();
  const summary = { detail: result.detail };
  await writeLog({ action: "refresh_cache", status: "ok", summary, actor, ipAddress });
  return { action: "refresh_cache", status: "ok", message: result.detail, after: summary };
}

export async function listProductRecoveryLog(limit = 200) {
  return db.select().from(productRecoveryLogTable).orderBy(desc(productRecoveryLogTable.createdAt)).limit(limit);
}
