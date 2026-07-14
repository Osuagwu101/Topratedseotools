import { db, ordersTable, paymentRecoveryLogTable, type StaffUser } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "./logger";
import { isDatasetUnlocked, getDatasetDefinition } from "./protectedData";
import { hydrateProcessEnvFromConfig } from "./systemConfig";
import { getPaymentHealth, verifyApiConnection, verifyWebhooks } from "./paymentHealth";
import { getPaymentSettings, invalidatePaymentSettingsCache, repairPaymentSettings, resolveActivePaystackSecretKey } from "./paymentSettings";

export interface PaymentRecoveryResult {
  action: string;
  status: "ok" | "blocked" | "partial";
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  detail?: Record<string, unknown>;
}

async function writeLog(entry: {
  action: string;
  status: PaymentRecoveryResult["status"];
  summary: Record<string, unknown>;
  actor: StaffUser | undefined;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(paymentRecoveryLogTable).values({
    action: entry.action,
    status: entry.status,
    summary: entry.summary,
    staffUserId: entry.actor?.id ?? null,
    staffEmail: entry.actor?.email ?? null,
    staffName: entry.actor?.name ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

const PAYMENT_SETTINGS_DATASET = "payment_settings";

// ------------------------------------------------------------- 1. VERIFY GATEWAY

/**
 * Read-only diagnostic: reuses the existing Payment Health aggregator
 * (secret key present, gateway enabled, Paystack API reachable, webhook
 * freshness, mode) rather than re-implementing any of those checks.
 */
export async function verifyGateway(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  const health = await getPaymentHealth();
  const summary = { status: health.status, checks: health.checks };
  const status: PaymentRecoveryResult["status"] = health.status === "healthy" ? "ok" : "partial";
  await writeLog({ action: "verify_gateway", status, summary, actor, ipAddress });
  return {
    action: "verify_gateway",
    status,
    message:
      health.status === "healthy"
        ? "Payment gateway is healthy: secret key configured, Paystack reachable, webhooks recent."
        : `Payment gateway needs attention: ${health.checks
            .filter((c) => c.severity !== "ok")
            .map((c) => `${c.label} — ${c.message}`)
            .join("; ")}`,
    after: summary,
  };
}

// ------------------------------------------------------- 2. REPAIR PAYMENT CONFIGURATION

/**
 * Reuses paymentSettings.repairPaymentSettings — resets negative tax/fee/
 * min/max values and unsupported currencies back to safe defaults. Never
 * touches the secret key itself (that lives in System Configuration) and
 * never touches an order or transaction record.
 */
export async function repairPaymentConfiguration(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  if (!(await isDatasetUnlocked(PAYMENT_SETTINGS_DATASET))) {
    const def = getDatasetDefinition(PAYMENT_SETTINGS_DATASET);
    const message = `"${def?.label ?? PAYMENT_SETTINGS_DATASET}" is protected and locked. Unlock it from the Protected Data centre before repairing payment configuration.`;
    await writeLog({ action: "repair_payment_configuration", status: "blocked", summary: { error: message }, actor, ipAddress });
    return { action: "repair_payment_configuration", status: "blocked", message };
  }

  const { changes } = await repairPaymentSettings(actor?.email);
  const summary = { changes };
  await writeLog({ action: "repair_payment_configuration", status: "ok", summary, actor, ipAddress });
  return {
    action: "repair_payment_configuration",
    status: "ok",
    message: changes.length === 0 ? "Payment configuration already looks valid — nothing to repair." : `Repaired payment configuration: ${changes.join(" ")}`,
    after: summary,
  };
}

// ------------------------------------------------------------- 3. VERIFY WEBHOOKS

/** Read-only diagnostic: reuses paymentHealth.verifyWebhooks (checks freshness of the last signature-verified delivery). */
export async function verifyWebhooksAction(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  const result = await verifyWebhooks();
  const summary = { ok: result.ok, message: result.message };
  await writeLog({ action: "verify_webhooks", status: result.ok ? "ok" : "partial", summary, actor, ipAddress });
  return { action: "verify_webhooks", status: result.ok ? "ok" : "partial", message: result.message, after: summary };
}

// ------------------------------------------------------- 4. VERIFY TRANSACTION RECORDS

const TRANSACTION_CHECK_LIMIT = 25;

interface TransactionMismatch {
  orderId: number;
  reference: string;
  localStatus: string;
  localAmountKobo: number;
  paystackStatus: string | null;
  paystackAmountKobo: number | null;
  issue: string;
}

/**
 * Cross-checks the most recent local orders against Paystack's own record of
 * that transaction (by reference). Purely diagnostic: it never writes to
 * orders, never reverses/alters a real Paystack transaction, and is bounded
 * to a recent window so it can't runaway-hammer the Paystack API. Any
 * mismatch (status or amount) is reported for manual review only.
 */
export async function verifyTransactionRecords(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  const settings = await getPaymentSettings();
  const key = resolveActivePaystackSecretKey(settings);
  if (!key) {
    const message = `No ${settings.testMode ? "test" : "live"} secret key is configured — cannot cross-check transactions against Paystack.`;
    await writeLog({ action: "verify_transaction_records", status: "partial", summary: { error: message }, actor, ipAddress });
    return { action: "verify_transaction_records", status: "partial", message };
  }

  const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.id)).limit(TRANSACTION_CHECK_LIMIT);
  if (orders.length === 0) {
    const summary = { checked: 0, mismatches: [] as TransactionMismatch[] };
    await writeLog({ action: "verify_transaction_records", status: "ok", summary, actor, ipAddress });
    return { action: "verify_transaction_records", status: "ok", message: "No orders exist yet — nothing to cross-check.", after: summary };
  }

  const mismatches: TransactionMismatch[] = [];
  let checked = 0;
  let notFound = 0;

  for (const order of orders) {
    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(order.reference)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = (await res.json().catch(() => ({}))) as { status?: boolean; data?: { status?: string; amount?: number }; message?: string };
      checked++;
      if (!res.ok || !body.status || !body.data) {
        notFound++;
        mismatches.push({
          orderId: order.id,
          reference: order.reference,
          localStatus: order.status,
          localAmountKobo: order.amountKobo,
          paystackStatus: null,
          paystackAmountKobo: null,
          issue: body.message || `Paystack has no record of this reference (HTTP ${res.status}).`,
        });
        continue;
      }
      const paystackStatus = body.data.status ?? "unknown";
      const paystackAmount = body.data.amount ?? null;
      // Local "status" is the app's own lifecycle state (pending/success/failed); Paystack's
      // "success" is the only local state that should ever correspond to it — anything else
      // local marks "success" for is worth a human look, even if Paystack later reversed it
      // (that's tracked separately in settlementStatus, which this never touches).
      const statusMismatch = order.status === "success" && paystackStatus !== "success";
      const amountMismatch = paystackAmount != null && order.amountKobo !== paystackAmount;
      if (statusMismatch || amountMismatch) {
        mismatches.push({
          orderId: order.id,
          reference: order.reference,
          localStatus: order.status,
          localAmountKobo: order.amountKobo,
          paystackStatus,
          paystackAmountKobo: paystackAmount,
          issue: statusMismatch && amountMismatch ? "Status and amount both differ from Paystack." : statusMismatch ? "Local status is 'success' but Paystack disagrees." : "Amount differs from what Paystack recorded.",
        });
      }
    } catch (err) {
      checked++;
      mismatches.push({
        orderId: order.id,
        reference: order.reference,
        localStatus: order.status,
        localAmountKobo: order.amountKobo,
        paystackStatus: null,
        paystackAmountKobo: null,
        issue: err instanceof Error ? err.message : "Could not reach Paystack for this reference.",
      });
    }
  }

  const summary = { checked, windowSize: orders.length, mismatchCount: mismatches.length, notFound, mismatches };
  const status: PaymentRecoveryResult["status"] = mismatches.length > 0 ? "partial" : "ok";
  await writeLog({ action: "verify_transaction_records", status, summary, actor, ipAddress });
  return {
    action: "verify_transaction_records",
    status,
    message:
      mismatches.length === 0
        ? `Cross-checked the ${checked} most recent order(s) against Paystack — all match. No changes were made to any order.`
        : `Cross-checked the ${checked} most recent order(s) against Paystack — found ${mismatches.length} mismatch(es) for manual review. No order or transaction record was changed.`,
    after: summary,
    detail: { mismatches },
  };
}

// ------------------------------------------------------- 5. RELOAD PAYMENT SERVICES

/**
 * "Reload Payment Services": clears the in-memory payment_settings cache and
 * re-reads the row fresh from the database, so an admin can confirm the
 * running server sees the latest saved settings without waiting out the
 * cache TTL. Does not touch the Paystack connection itself (see Reconnect).
 */
export async function reloadPaymentServices(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  invalidatePaymentSettingsCache();
  const settings = await getPaymentSettings();
  const summary = {
    enabled: settings.enabled,
    testMode: settings.testMode,
    currency: settings.currency,
    taxPercent: settings.taxPercent,
    feePercent: settings.feePercent,
    minPurchaseKobo: settings.minPurchaseKobo,
    maxPurchaseKobo: settings.maxPurchaseKobo,
  };
  await writeLog({ action: "reload_payment_services", status: "ok", summary, actor, ipAddress });
  return {
    action: "reload_payment_services",
    status: "ok",
    message: `Reloaded payment settings from the database (${settings.testMode ? "test" : "live"} mode, gateway ${settings.enabled ? "enabled" : "disabled"}).`,
    after: summary,
  };
}

// ------------------------------------------------------- 6. RECONNECT PAYMENT GATEWAY

/**
 * "Reconnect Payment Gateway": re-hydrates process.env from System
 * Configuration (in case a secret key was rotated there since the server
 * started), clears the payment settings cache, then re-pings Paystack —
 * meant for "I just rotated the key, is it live yet?" rather than a plain
 * status check (that's Verify Gateway).
 */
export async function reconnectPaymentGateway(actor: StaffUser | undefined, ipAddress?: string | null): Promise<PaymentRecoveryResult> {
  await hydrateProcessEnvFromConfig();
  invalidatePaymentSettingsCache();
  const result = await verifyApiConnection();
  const summary = { ok: result.ok, message: result.message };
  await writeLog({ action: "reconnect_payment_gateway", status: result.ok ? "ok" : "partial", summary, actor, ipAddress });
  return {
    action: "reconnect_payment_gateway",
    status: result.ok ? "ok" : "partial",
    message: `Reloaded configuration and re-tested the Paystack connection: ${result.message}`,
    after: summary,
  };
}

export async function listPaymentRecoveryLog(limit = 200) {
  return db.select().from(paymentRecoveryLogTable).orderBy(desc(paymentRecoveryLogTable.createdAt)).limit(limit);
}
