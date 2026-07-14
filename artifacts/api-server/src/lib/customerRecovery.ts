import { db, customerRecoveryLogTable, type StaffUser } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "./logger";
import { runScan, repairFinding, type IntegrityReport } from "./dbIntegrity";

export interface CustomerRecoveryResult {
  action: string;
  status: "ok" | "blocked" | "partial";
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  report?: IntegrityReport;
}

async function writeLog(entry: {
  action: string;
  status: CustomerRecoveryResult["status"];
  summary: Record<string, unknown>;
  actor: StaffUser | undefined;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(customerRecoveryLogTable).values({
    action: entry.action,
    status: entry.status,
    summary: entry.summary,
    staffUserId: entry.actor?.id ?? null,
    staffEmail: entry.actor?.email ?? null,
    staffName: entry.actor?.name ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

/**
 * Every Customer Recovery action follows the same shape: scan the Database
 * Integrity Checker's checks scoped to this action's slice of customer data,
 * then automatically repair every finding that has a safe, automated repair
 * (relinking a broken reference or clearing a stale status) — never
 * deleting a customer-identifying row (orders, entitlements, assignments,
 * device sessions, credits). Findings with no automated repair, or whose
 * repair is gated by a still-locked Protected Data dataset, are reported
 * but left untouched.
 */
async function verifyAndRepair(
  actionKey: string,
  label: string,
  checkKeys: string[],
  actor: StaffUser | undefined,
  ipAddress?: string | null,
): Promise<CustomerRecoveryResult> {
  const report = await runScan(actor, ipAddress, { checkKeys });

  const repaired: { key: string; label: string; repairedCount: number }[] = [];
  const blocked: { key: string; label: string; error: string }[] = [];
  const manualReviewOnly: { key: string; label: string; count: number }[] = [];

  for (const finding of report.findings) {
    if (!finding.repairable) {
      manualReviewOnly.push({ key: finding.key, label: finding.label, count: finding.count });
      continue;
    }
    try {
      const outcome = await repairFinding(finding.key, actor, ipAddress);
      if (outcome.status === "repaired") {
        repaired.push({ key: finding.key, label: finding.label, repairedCount: outcome.repairedCount });
      } else if (outcome.status === "blocked") {
        blocked.push({ key: finding.key, label: finding.label, error: outcome.error });
      } else {
        manualReviewOnly.push({ key: finding.key, label: finding.label, count: finding.count });
      }
    } catch (err) {
      blocked.push({ key: finding.key, label: finding.label, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const totalRepaired = repaired.reduce((sum, r) => sum + r.repairedCount, 0);
  const summary = {
    totalFindings: report.totalFindings,
    findingKeys: report.findings.map((f) => f.key),
    repaired,
    blocked,
    manualReviewOnly,
  };

  const status: CustomerRecoveryResult["status"] = blocked.length > 0 ? "partial" : "ok";

  let message: string;
  if (report.totalFindings === 0) {
    message = `No issues found — ${label.toLowerCase()} data is consistent.`;
  } else {
    const parts: string[] = [];
    if (totalRepaired > 0) parts.push(`repaired ${totalRepaired} record(s) across ${repaired.length} check(s)`);
    if (blocked.length > 0) parts.push(`${blocked.length} check(s) blocked by a locked Protected Data dataset`);
    if (manualReviewOnly.length > 0) parts.push(`${manualReviewOnly.reduce((s, m) => s + m.count, 0)} finding(s) need manual review`);
    message = `Checked ${label.toLowerCase()} data and found ${report.totalFindings} issue(s): ${parts.join("; ")}.`;
  }

  await writeLog({ action: actionKey, status, summary, actor, ipAddress });
  return { action: actionKey, status, message, after: summary, report };
}

// ------------------------------------------------------------------ ACTIONS

/**
 * Users: cross-checks device sessions against the local record of who has
 * ever ordered, been entitled, or been assigned a tool, and flags any
 * customer whose store-credit balance has drifted negative. Purely
 * diagnostic where no safe repair exists (a device session with no linked
 * purchase is not itself broken, just informational) — never touches a
 * user_device_sessions row.
 */
export const USER_CHECK_KEYS = ["device_sessions_orphaned", "negative_credit_balance"];
export async function verifyUsers(actor: StaffUser | undefined, ipAddress?: string | null) {
  return verifyAndRepair("verify_users", "Users", USER_CHECK_KEYS, actor, ipAddress);
}

/**
 * Purchases: orphaned orders, orders that paid but never got an entitlement
 * (safely repaired by creating the missing entitlement), and coupon
 * redemptions / credit transactions / referrals that point at a missing
 * order.
 */
export const PURCHASE_CHECK_KEYS = [
  "orders_missing_product",
  "successful_order_missing_entitlement",
  "redemptions_missing_order",
  "credit_transactions_missing_order",
  "referrals_missing_qualifying_order",
];
export async function verifyPurchases(actor: StaffUser | undefined, ipAddress?: string | null) {
  return verifyAndRepair("verify_purchases", "Purchases", PURCHASE_CHECK_KEYS, actor, ipAddress);
}

/**
 * Subscriptions: entitlements/assignments whose expiry has already passed
 * but are still marked active (repaired by flipping status to expired), and
 * entitlements still active despite the underlying order being
 * refunded/disputed/reversed (repaired by revoking).
 */
export const SUBSCRIPTION_CHECK_KEYS = [
  "expired_entitlement_still_active",
  "expired_assignment_still_active",
  "active_entitlement_after_settlement_reversal",
];
export async function verifySubscriptions(actor: StaffUser | undefined, ipAddress?: string | null) {
  return verifyAndRepair("verify_subscriptions", "Subscriptions", SUBSCRIPTION_CHECK_KEYS, actor, ipAddress);
}

/**
 * Downloads: an entitlement's serverId (the channel a customer actually
 * downloads/accesses the tool through) pointing at a deleted/missing
 * tool_servers row — repaired by relinking to the product's current
 * default server.
 */
export const DOWNLOAD_CHECK_KEYS = ["entitlements_invalid_server"];
export async function verifyDownloads(actor: StaffUser | undefined, ipAddress?: string | null) {
  return verifyAndRepair("verify_downloads", "Downloads", DOWNLOAD_CHECK_KEYS, actor, ipAddress);
}

/**
 * Entitlements: entitlements/assignments referencing a deleted product,
 * entitlements pointing at a deleted tool assignment (repaired by clearing
 * the stale link), and duplicate active entitlements/assignments for the
 * same user+product (repaired by keeping the longest-lived one and revoking
 * the rest — never deleting any row).
 */
export const ENTITLEMENT_CHECK_KEYS = [
  "entitlements_missing_product",
  "entitlements_missing_order",
  "entitlements_invalid_assignment",
  "tool_assignments_missing_product",
  "duplicate_active_entitlements",
  "duplicate_active_assignments",
];
export async function verifyEntitlements(actor: StaffUser | undefined, ipAddress?: string | null) {
  return verifyAndRepair("verify_entitlements", "Entitlements", ENTITLEMENT_CHECK_KEYS, actor, ipAddress);
}

export async function listCustomerRecoveryLog(limit = 200) {
  logger.debug({ limit }, "Listing customer recovery log");
  return db.select().from(customerRecoveryLogTable).orderBy(desc(customerRecoveryLogTable.createdAt)).limit(limit);
}
