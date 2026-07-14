import {
  db,
  productsTable,
  ordersTable,
  toolServersTable,
  toolAssignmentsTable,
  toolEntitlementsTable,
  couponsTable,
  couponRedemptionsTable,
  referralsTable,
  creditTransactionsTable,
  userCreditsTable,
  userDailyUsageTable,
  integrityAuditLogTable,
  type StaffUser,
} from "@workspace/db";
import { eq, inArray, isNotNull, and, ne } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { logger } from "./logger";
import { pickDefaultServerForProduct } from "./toolAccess";
import { isDatasetUnlocked, getDatasetDefinition } from "./protectedData";

export type IntegrityCategory = "missing" | "broken" | "duplicate" | "orphaned" | "invalid_relationship";

export interface IntegrityScanResult {
  count: number;
  sample: Record<string, unknown>[];
}

export interface IntegrityRepairResult {
  repairedCount: number;
  detail: Record<string, unknown>;
}

export interface IntegrityCheck {
  key: string;
  label: string;
  category: IntegrityCategory;
  table: string;
  description: string;
  /** Protected dataset (see protectedData.ts) that must be unlocked before this check's repair can run. */
  protectedDataset?: string;
  scan: () => Promise<IntegrityScanResult>;
  repair?: (actor: StaffUser | undefined) => Promise<IntegrityRepairResult>;
}

const SAMPLE_LIMIT = 10;

async function validIds(table: PgTableWithColumns<any>): Promise<Set<number>> {
  const rows = (await db.select({ id: (table as any).id }).from(table as any)) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

const CHECKS: IntegrityCheck[] = [
  // ---------------------------------------------------------------- ORPHANED
  {
    key: "orders_missing_product",
    label: "Orders referencing a deleted/missing product",
    category: "orphaned",
    table: "orders",
    description: "An order's productId no longer matches any row in products.",
    scan: async () => {
      const [products, orders] = await Promise.all([validIds(productsTable), db.select().from(ordersTable)]);
      const bad = orders.filter((o) => !products.has(o.productId));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((o) => ({ id: o.id, reference: o.reference, productId: o.productId, customerEmail: o.customerEmail })),
      };
    },
  },
  {
    key: "tool_servers_missing_product",
    label: "Tool servers referencing a deleted/missing product",
    category: "orphaned",
    table: "tool_servers",
    description: "A tool server's productId no longer matches any row in products.",
    scan: async () => {
      const [products, servers] = await Promise.all([validIds(productsTable), db.select().from(toolServersTable)]);
      const bad = servers.filter((s) => !products.has(s.productId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((s) => ({ id: s.id, label: s.label, productId: s.productId })) };
    },
  },
  {
    key: "tool_assignments_missing_product",
    label: "Tool assignments referencing a deleted/missing product",
    category: "orphaned",
    table: "tool_assignments",
    description: "A tool assignment's productId no longer matches any row in products.",
    scan: async () => {
      const [products, assignments] = await Promise.all([validIds(productsTable), db.select().from(toolAssignmentsTable)]);
      const bad = assignments.filter((a) => !products.has(a.productId));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((a) => ({ id: a.id, clerkUserId: a.clerkUserId, productId: a.productId, status: a.status })),
      };
    },
  },
  {
    key: "entitlements_missing_product",
    label: "Entitlements referencing a deleted/missing product",
    category: "orphaned",
    table: "tool_entitlements",
    description: "A tool entitlement's productId no longer matches any row in products.",
    scan: async () => {
      const [products, entitlements] = await Promise.all([validIds(productsTable), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => !products.has(e.productId));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((e) => ({ id: e.id, clerkUserId: e.clerkUserId, productId: e.productId, status: e.status })),
      };
    },
  },
  {
    key: "entitlements_missing_order",
    label: "Entitlements referencing a deleted/missing order",
    category: "orphaned",
    table: "tool_entitlements",
    description: "A tool entitlement's orderId no longer matches any row in orders.",
    scan: async () => {
      const [orders, entitlements] = await Promise.all([validIds(ordersTable as any), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => e.orderId != null && !orders.has(e.orderId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((e) => ({ id: e.id, clerkUserId: e.clerkUserId, orderId: e.orderId })) };
    },
  },
  {
    key: "entitlements_invalid_server",
    label: "Entitlements pointing at a deleted/missing server",
    category: "orphaned",
    table: "tool_entitlements",
    description: "A tool entitlement's serverId no longer matches any row in tool_servers.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const [servers, entitlements] = await Promise.all([validIds(toolServersTable as any), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => e.serverId != null && !servers.has(e.serverId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((e) => ({ id: e.id, clerkUserId: e.clerkUserId, serverId: e.serverId })) };
    },
    repair: async () => {
      const [servers, entitlements] = await Promise.all([validIds(toolServersTable as any), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => e.serverId != null && !servers.has(e.serverId));
      let repaired = 0;
      const detail: Record<string, unknown>[] = [];
      for (const e of bad) {
        const newServerId = await pickDefaultServerForProduct(e.productId);
        await db.update(toolEntitlementsTable).set({ serverId: newServerId, updatedAt: new Date() }).where(eq(toolEntitlementsTable.id, e.id));
        detail.push({ id: e.id, oldServerId: e.serverId, newServerId });
        repaired++;
      }
      return { repairedCount: repaired, detail: { relinked: detail } };
    },
  },
  {
    key: "entitlements_invalid_assignment",
    label: "Entitlements pointing at a deleted/missing tool assignment",
    category: "orphaned",
    table: "tool_entitlements",
    description: "A tool entitlement's assignmentId no longer matches any row in tool_assignments.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const [assignments, entitlements] = await Promise.all([validIds(toolAssignmentsTable as any), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => e.assignmentId != null && !assignments.has(e.assignmentId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((e) => ({ id: e.id, clerkUserId: e.clerkUserId, assignmentId: e.assignmentId })) };
    },
    repair: async () => {
      const [assignments, entitlements] = await Promise.all([validIds(toolAssignmentsTable as any), db.select().from(toolEntitlementsTable)]);
      const bad = entitlements.filter((e) => e.assignmentId != null && !assignments.has(e.assignmentId));
      for (const e of bad) {
        await db.update(toolEntitlementsTable).set({ assignmentId: null, updatedAt: new Date() }).where(eq(toolEntitlementsTable.id, e.id));
      }
      return { repairedCount: bad.length, detail: { clearedIds: bad.map((e) => e.id) } };
    },
  },
  {
    key: "coupons_invalid_product_ids",
    label: "Coupons scoped to a deleted/missing product",
    category: "orphaned",
    table: "coupons",
    description: "A coupon's productIds array contains an id that no longer matches any row in products.",
    protectedDataset: "coupons",
    scan: async () => {
      const [products, coupons] = await Promise.all([validIds(productsTable), db.select().from(couponsTable)]);
      const bad = coupons.filter((c) => c.productIds.some((id) => !products.has(id)));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((c) => ({ id: c.id, code: c.code, productIds: c.productIds, invalidIds: c.productIds.filter((id) => !products.has(id)) })),
      };
    },
    repair: async () => {
      const [products, coupons] = await Promise.all([validIds(productsTable), db.select().from(couponsTable)]);
      const bad = coupons.filter((c) => c.productIds.some((id) => !products.has(id)));
      for (const c of bad) {
        const cleaned = c.productIds.filter((id) => products.has(id));
        await db.update(couponsTable).set({ productIds: cleaned, updatedAt: new Date() }).where(eq(couponsTable.id, c.id));
      }
      return { repairedCount: bad.length, detail: { cleanedIds: bad.map((c) => c.id) } };
    },
  },
  {
    key: "redemptions_missing_coupon",
    label: "Coupon redemptions referencing a deleted/missing coupon",
    category: "orphaned",
    table: "coupon_redemptions",
    description: "A coupon redemption's couponId no longer matches any row in coupons.",
    scan: async () => {
      const [coupons, redemptions] = await Promise.all([validIds(couponsTable as any), db.select().from(couponRedemptionsTable)]);
      const bad = redemptions.filter((r) => !coupons.has(r.couponId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, couponId: r.couponId, orderId: r.orderId })) };
    },
  },
  {
    key: "redemptions_missing_order",
    label: "Coupon redemptions referencing a deleted/missing order",
    category: "orphaned",
    table: "coupon_redemptions",
    description: "A coupon redemption's orderId no longer matches any row in orders.",
    scan: async () => {
      const [orders, redemptions] = await Promise.all([validIds(ordersTable as any), db.select().from(couponRedemptionsTable)]);
      const bad = redemptions.filter((r) => !orders.has(r.orderId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, couponId: r.couponId, orderId: r.orderId })) };
    },
  },
  {
    key: "referrals_missing_qualifying_order",
    label: "Referrals whose qualifying order no longer exists",
    category: "orphaned",
    table: "referrals",
    description: "A referral's qualifyingOrderId no longer matches any row in orders.",
    scan: async () => {
      const [orders, referrals] = await Promise.all([validIds(ordersTable as any), db.select().from(referralsTable)]);
      const bad = referrals.filter((r) => r.qualifyingOrderId != null && !orders.has(r.qualifyingOrderId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, refereeClerkUserId: r.refereeClerkUserId, qualifyingOrderId: r.qualifyingOrderId })) };
    },
  },
  {
    key: "credit_transactions_missing_referral",
    label: "Credit transactions referencing a deleted/missing referral",
    category: "orphaned",
    table: "credit_transactions",
    description: "A credit transaction's referralId no longer matches any row in referrals.",
    scan: async () => {
      const [referrals, txns] = await Promise.all([validIds(referralsTable as any), db.select().from(creditTransactionsTable)]);
      const bad = txns.filter((t) => t.referralId != null && !referrals.has(t.referralId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((t) => ({ id: t.id, clerkUserId: t.clerkUserId, referralId: t.referralId, amountKobo: t.amountKobo })) };
    },
  },
  {
    key: "credit_transactions_missing_order",
    label: "Credit transactions referencing a deleted/missing order",
    category: "orphaned",
    table: "credit_transactions",
    description: "A credit transaction's orderId no longer matches any row in orders.",
    scan: async () => {
      const [orders, txns] = await Promise.all([validIds(ordersTable as any), db.select().from(creditTransactionsTable)]);
      const bad = txns.filter((t) => t.orderId != null && !orders.has(t.orderId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((t) => ({ id: t.id, clerkUserId: t.clerkUserId, orderId: t.orderId, amountKobo: t.amountKobo })) };
    },
  },
  {
    key: "usage_missing_product",
    label: "Daily usage records referencing a deleted/missing product",
    category: "orphaned",
    table: "user_daily_usage",
    description: "A user_daily_usage row's toolId no longer matches any row in products.",
    scan: async () => {
      const [products, usage] = await Promise.all([validIds(productsTable), db.select().from(userDailyUsageTable)]);
      const bad = usage.filter((u) => !products.has(u.toolId));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((u) => ({ id: u.id, userId: u.userId, toolId: u.toolId, usageDate: u.usageDate })) };
    },
  },

  // ----------------------------------------------------------------- BROKEN
  {
    key: "negative_credit_balance",
    label: "Users with a negative store-credit balance",
    category: "broken",
    table: "user_credits",
    description: "A user's store-credit balance is below zero, which should never happen.",
    scan: async () => {
      const rows = await db.select().from(userCreditsTable);
      const bad = rows.filter((r) => r.balanceKobo < 0);
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, clerkUserId: r.clerkUserId, balanceKobo: r.balanceKobo })) };
    },
  },
  {
    key: "referral_reward_without_transaction",
    label: "Referral rewards marked granted with no matching credit transaction",
    category: "broken",
    table: "referrals",
    description: "A referral is marked rewardGranted with a positive rewardKobo, but no credit_transactions row records the payout.",
    scan: async () => {
      const [referrals, txns] = await Promise.all([db.select().from(referralsTable), db.select().from(creditTransactionsTable)]);
      const referralIdsWithTxn = new Set(txns.filter((t) => t.referralId != null).map((t) => t.referralId as number));
      const bad = referrals.filter((r) => r.rewardGranted && (r.rewardKobo ?? 0) > 0 && !referralIdsWithTxn.has(r.id));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((r) => ({ id: r.id, referrerClerkUserId: r.referrerClerkUserId, rewardKobo: r.rewardKobo, completedAt: r.completedAt })),
      };
    },
  },
  {
    key: "active_entitlement_after_settlement_reversal",
    label: "Active entitlements for orders whose payment was refunded/disputed/reversed",
    category: "broken",
    table: "tool_entitlements",
    description: "An order's settlementStatus is no longer valid (refunded/disputed/reversed/fraudulent), but its tool entitlement is still active.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const orders = await db.select().from(ordersTable).where(ne(ordersTable.settlementStatus, "valid"));
      const orderIds = new Set(orders.map((o) => o.id));
      if (orderIds.size === 0) return { count: 0, sample: [] };
      const entitlements = await db
        .select()
        .from(toolEntitlementsTable)
        .where(and(eq(toolEntitlementsTable.status, "active"), isNotNull(toolEntitlementsTable.orderId)));
      const bad = entitlements.filter((e) => e.orderId != null && orderIds.has(e.orderId));
      const orderById = new Map(orders.map((o) => [o.id, o]));
      return {
        count: bad.length,
        sample: bad.slice(0, SAMPLE_LIMIT).map((e) => ({
          id: e.id,
          clerkUserId: e.clerkUserId,
          orderId: e.orderId,
          settlementStatus: e.orderId != null ? orderById.get(e.orderId)?.settlementStatus : null,
        })),
      };
    },
    repair: async () => {
      const orders = await db.select().from(ordersTable).where(ne(ordersTable.settlementStatus, "valid"));
      const orderIds = new Set(orders.map((o) => o.id));
      if (orderIds.size === 0) return { repairedCount: 0, detail: {} };
      const entitlements = await db
        .select()
        .from(toolEntitlementsTable)
        .where(and(eq(toolEntitlementsTable.status, "active"), isNotNull(toolEntitlementsTable.orderId)));
      const bad = entitlements.filter((e) => e.orderId != null && orderIds.has(e.orderId));
      if (bad.length > 0) {
        await db
          .update(toolEntitlementsTable)
          .set({ status: "revoked", updatedAt: new Date() })
          .where(inArray(toolEntitlementsTable.id, bad.map((e) => e.id)));
      }
      return { repairedCount: bad.length, detail: { revokedIds: bad.map((e) => e.id) } };
    },
  },

  // -------------------------------------------------------------- DUPLICATE
  {
    key: "duplicate_active_entitlements",
    label: "Duplicate active entitlements for the same user + product",
    category: "duplicate",
    table: "tool_entitlements",
    description: "A user has more than one active tool_entitlements row for the same product.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const rows = await db.select().from(toolEntitlementsTable).where(eq(toolEntitlementsTable.status, "active"));
      const groups = groupBy(rows, (r) => `${r.clerkUserId}:${r.productId}`);
      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      return {
        count: dupGroups.reduce((sum, g) => sum + g.length - 1, 0),
        sample: dupGroups.slice(0, SAMPLE_LIMIT).map((g) => ({
          clerkUserId: g[0].clerkUserId,
          productId: g[0].productId,
          entitlementIds: g.map((r) => r.id),
        })),
      };
    },
    repair: async () => {
      const rows = await db.select().from(toolEntitlementsTable).where(eq(toolEntitlementsTable.status, "active"));
      const groups = groupBy(rows, (r) => `${r.clerkUserId}:${r.productId}`);
      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      let revoked = 0;
      const detail: Record<string, unknown>[] = [];
      for (const g of dupGroups) {
        const sorted = [...g].sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
        const [keep, ...rest] = sorted;
        if (rest.length > 0) {
          await db
            .update(toolEntitlementsTable)
            .set({ status: "revoked", updatedAt: new Date() })
            .where(inArray(toolEntitlementsTable.id, rest.map((r) => r.id)));
          revoked += rest.length;
          detail.push({ kept: keep.id, revoked: rest.map((r) => r.id) });
        }
      }
      return { repairedCount: revoked, detail: { groups: detail } };
    },
  },
  {
    key: "duplicate_active_assignments",
    label: "Duplicate active tool assignments for the same user + product",
    category: "duplicate",
    table: "tool_assignments",
    description: "A user has more than one active tool_assignments row for the same product.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const rows = await db.select().from(toolAssignmentsTable).where(eq(toolAssignmentsTable.status, "active"));
      const groups = groupBy(rows, (r) => `${r.clerkUserId}:${r.productId}`);
      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      return {
        count: dupGroups.reduce((sum, g) => sum + g.length - 1, 0),
        sample: dupGroups.slice(0, SAMPLE_LIMIT).map((g) => ({
          clerkUserId: g[0].clerkUserId,
          productId: g[0].productId,
          assignmentIds: g.map((r) => r.id),
        })),
      };
    },
    repair: async () => {
      const rows = await db.select().from(toolAssignmentsTable).where(eq(toolAssignmentsTable.status, "active"));
      const groups = groupBy(rows, (r) => `${r.clerkUserId}:${r.productId}`);
      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      let revoked = 0;
      const detail: Record<string, unknown>[] = [];
      for (const g of dupGroups) {
        const sorted = [...g].sort((a, b) => {
          const bExp = b.expiresAt ? b.expiresAt.getTime() : Infinity;
          const aExp = a.expiresAt ? a.expiresAt.getTime() : Infinity;
          return bExp - aExp;
        });
        const [keep, ...rest] = sorted;
        if (rest.length > 0) {
          await db
            .update(toolAssignmentsTable)
            .set({ status: "revoked", revokedAt: new Date(), revokedBy: "system:db-integrity-checker", updatedAt: new Date() })
            .where(inArray(toolAssignmentsTable.id, rest.map((r) => r.id)));
          revoked += rest.length;
          detail.push({ kept: keep.id, revoked: rest.map((r) => r.id) });
        }
      }
      return { repairedCount: revoked, detail: { groups: detail } };
    },
  },
  {
    key: "duplicate_coupon_codes",
    label: "Coupon codes that only differ by case or whitespace",
    category: "duplicate",
    table: "coupons",
    description: "Two or more coupons normalize to the same code, which can confuse checkout even though the database's exact-match unique constraint allowed both rows.",
    scan: async () => {
      const rows = await db.select().from(couponsTable);
      const groups = groupBy(rows, (r) => r.code.trim().toUpperCase());
      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      return {
        count: dupGroups.reduce((sum, g) => sum + g.length, 0),
        sample: dupGroups.slice(0, SAMPLE_LIMIT).map((g) => ({ normalizedCode: g[0].code.trim().toUpperCase(), coupons: g.map((c) => ({ id: c.id, code: c.code, active: c.active })) })),
      };
    },
  },

  // ------------------------------------------------------------------ MISSING
  {
    key: "successful_order_missing_entitlement",
    label: "Successful orders with a customer account but no entitlement",
    category: "missing",
    table: "tool_entitlements",
    description: "An order was marked successful (paid) for a signed-in customer, but no tool_entitlements row was ever created for it — the customer paid but has no access.",
    protectedDataset: "subscriptions",
    scan: async () => {
      const orders = await db.select().from(ordersTable).where(and(eq(ordersTable.status, "success"), isNotNull(ordersTable.clerkUserId)));
      if (orders.length === 0) return { count: 0, sample: [] };
      const entitlements = await db.select({ orderId: toolEntitlementsTable.orderId }).from(toolEntitlementsTable);
      const entitledOrderIds = new Set(entitlements.map((e) => e.orderId).filter((id): id is number => id != null));
      const bad = orders.filter((o) => !entitledOrderIds.has(o.id));
      return { count: bad.length, sample: bad.slice(0, SAMPLE_LIMIT).map((o) => ({ id: o.id, reference: o.reference, customerEmail: o.customerEmail, createdAt: o.createdAt })) };
    },
    repair: async () => {
      const orders = await db.select().from(ordersTable).where(and(eq(ordersTable.status, "success"), isNotNull(ordersTable.clerkUserId)));
      if (orders.length === 0) return { repairedCount: 0, detail: {} };
      const entitlements = await db.select({ orderId: toolEntitlementsTable.orderId }).from(toolEntitlementsTable);
      const entitledOrderIds = new Set(entitlements.map((e) => e.orderId).filter((id): id is number => id != null));
      const bad = orders.filter((o) => !entitledOrderIds.has(o.id));
      let created = 0;
      const detail: Record<string, unknown>[] = [];
      for (const o of bad) {
        if (!o.clerkUserId) continue;
        const expires = new Date(o.createdAt);
        expires.setMonth(expires.getMonth() + o.durationMonths);
        const serverId = await pickDefaultServerForProduct(o.productId);
        const inserted = await db
          .insert(toolEntitlementsTable)
          .values({
            clerkUserId: o.clerkUserId,
            productId: o.productId,
            serverId,
            orderId: o.id,
            reference: o.reference,
            status: "active",
            expiresAt: expires,
          })
          .onConflictDoNothing({ target: toolEntitlementsTable.orderId })
          .returning();
        if (inserted.length > 0) {
          created++;
          detail.push({ orderId: o.id, entitlementId: inserted[0].id, expiresAt: expires.toISOString() });
        }
      }
      return { repairedCount: created, detail: { created: detail } };
    },
  },
];

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

export function listChecks() {
  return CHECKS.map((c) => ({ key: c.key, label: c.label, category: c.category, table: c.table, description: c.description, repairable: !!c.repair, protectedDataset: c.protectedDataset ?? null }));
}

export interface IntegrityFinding {
  key: string;
  label: string;
  category: IntegrityCategory;
  table: string;
  description: string;
  count: number;
  sample: Record<string, unknown>[];
  repairable: boolean;
  protectedDataset: string | null;
}

export interface IntegrityReport {
  generatedAt: string;
  totalFindings: number;
  findings: IntegrityFinding[];
}

export async function runScan(
  actor: StaffUser | undefined,
  ipAddress?: string | null,
  options?: { checkKeys?: string[] },
): Promise<IntegrityReport> {
  const findings: IntegrityFinding[] = [];
  const checksToRun = options?.checkKeys ? CHECKS.filter((c) => options.checkKeys!.includes(c.key)) : CHECKS;
  for (const check of checksToRun) {
    try {
      const result = await check.scan();
      if (result.count > 0) {
        findings.push({
          key: check.key,
          label: check.label,
          category: check.category,
          table: check.table,
          description: check.description,
          count: result.count,
          sample: result.sample,
          repairable: !!check.repair,
          protectedDataset: check.protectedDataset ?? null,
        });
      }
    } catch (err) {
      logger.error({ err, checkKey: check.key }, "Integrity check failed to run");
    }
  }
  const totalFindings = findings.reduce((sum, f) => sum + f.count, 0);
  await db.insert(integrityAuditLogTable).values({
    action: "scan_run",
    summary: {
      totalFindings,
      findingCounts: Object.fromEntries(findings.map((f) => [f.key, f.count])),
      scoped: options?.checkKeys ? options.checkKeys : undefined,
    },
    staffUserId: actor?.id ?? null,
    staffEmail: actor?.email ?? null,
    staffName: actor?.name ?? null,
    ipAddress: ipAddress ?? null,
  });
  return { generatedAt: new Date().toISOString(), totalFindings, findings };
}

export type RepairOutcome =
  | { status: "repaired"; repairedCount: number; detail: Record<string, unknown> }
  | { status: "blocked"; error: string }
  | { status: "not_repairable"; error: string }
  | { status: "not_found"; error: string };

export async function repairFinding(checkKey: string, actor: StaffUser | undefined, ipAddress?: string | null): Promise<RepairOutcome> {
  const check = CHECKS.find((c) => c.key === checkKey);
  if (!check) return { status: "not_found", error: "Unknown integrity check." };
  if (!check.repair) return { status: "not_repairable", error: "This finding isn't safely automatable and needs manual review." };

  if (check.protectedDataset && !(await isDatasetUnlocked(check.protectedDataset))) {
    const def = getDatasetDefinition(check.protectedDataset);
    const error = `"${def?.label ?? check.protectedDataset}" is protected and locked. Unlock it from the Protected Data centre before repairing this finding.`;
    await db.insert(integrityAuditLogTable).values({
      action: "repair_blocked",
      checkKey,
      summary: { error },
      staffUserId: actor?.id ?? null,
      staffEmail: actor?.email ?? null,
      staffName: actor?.name ?? null,
      ipAddress: ipAddress ?? null,
    });
    return { status: "blocked", error };
  }

  try {
    const { repairedCount, detail } = await check.repair(actor);
    await db.insert(integrityAuditLogTable).values({
      action: "repair_applied",
      checkKey,
      summary: { repairedCount, detail },
      staffUserId: actor?.id ?? null,
      staffEmail: actor?.email ?? null,
      staffName: actor?.name ?? null,
      ipAddress: ipAddress ?? null,
    });
    logger.info({ checkKey, repairedCount }, "Integrity repair applied");
    return { status: "repaired", repairedCount, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(integrityAuditLogTable).values({
      action: "repair_failed",
      checkKey,
      summary: { error: message },
      staffUserId: actor?.id ?? null,
      staffEmail: actor?.email ?? null,
      staffName: actor?.name ?? null,
      ipAddress: ipAddress ?? null,
    });
    logger.error({ err, checkKey }, "Integrity repair failed");
    throw err;
  }
}

export async function listAuditLog(limit = 200) {
  const { desc } = await import("drizzle-orm");
  return db.select().from(integrityAuditLogTable).orderBy(desc(integrityAuditLogTable.createdAt)).limit(limit);
}
