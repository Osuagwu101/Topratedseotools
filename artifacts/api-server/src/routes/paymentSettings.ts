import { Router, type IRouter, type RequestHandler } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { logger } from "../lib/logger";
import {
  getPaymentSettings,
  updatePaymentSettings,
  repairPaymentSettings,
  invalidatePaymentSettingsCache,
  SUPPORTED_CURRENCIES,
} from "../lib/paymentSettings";
import { getPaymentHealth, verifyApiConnection, verifyWebhooks, runTestPayment } from "../lib/paymentHealth";

const router: IRouter = Router();
const requireAdmin: RequestHandler = requireSuperAdmin;

// Public, read-only subset — lets the storefront enforce min/max and preview
// tax/fees before checkout without exposing test/live mode or webhook state.
router.get("/payment-settings", async (_req, res): Promise<void> => {
  try {
    const s = await getPaymentSettings();
    res.json({
      enabled: s.enabled,
      currency: s.currency,
      taxPercent: s.taxPercent,
      feePercent: s.feePercent,
      feeFlatKobo: s.feeFlatKobo,
      minPurchaseKobo: s.minPurchaseKobo,
      maxPurchaseKobo: s.maxPurchaseKobo,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch public payment settings");
    res.status(500).json({ error: "Failed to fetch payment settings" });
  }
});

router.get("/admin/payment-settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await getPaymentSettings());
  } catch (err) {
    logger.error({ err }, "Failed to fetch payment settings");
    res.status(500).json({ error: "Failed to fetch payment settings" });
  }
});

router.put("/admin/payment-settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const {
      enabled,
      testMode,
      currency,
      taxPercent,
      feePercent,
      feeFlatKobo,
      minPurchaseKobo,
      maxPurchaseKobo,
    } = req.body as {
      enabled?: boolean;
      testMode?: boolean;
      currency?: string;
      taxPercent?: number;
      feePercent?: number;
      feeFlatKobo?: number;
      minPurchaseKobo?: number;
      maxPurchaseKobo?: number | null;
    };

    if (currency !== undefined && !SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number])) {
      res.status(400).json({ error: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}` });
      return;
    }
    if (taxPercent !== undefined && (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100)) {
      res.status(400).json({ error: "Tax percentage must be between 0 and 100." });
      return;
    }
    if (feePercent !== undefined && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100)) {
      res.status(400).json({ error: "Processing fee percentage must be between 0 and 100." });
      return;
    }
    if (feeFlatKobo !== undefined && (!Number.isInteger(feeFlatKobo) || feeFlatKobo < 0)) {
      res.status(400).json({ error: "Flat processing fee must be a non-negative whole number." });
      return;
    }
    if (minPurchaseKobo !== undefined && (!Number.isInteger(minPurchaseKobo) || minPurchaseKobo < 0)) {
      res.status(400).json({ error: "Minimum purchase amount must be a non-negative whole number." });
      return;
    }
    if (
      maxPurchaseKobo !== undefined &&
      maxPurchaseKobo !== null &&
      (!Number.isInteger(maxPurchaseKobo) || maxPurchaseKobo < 0)
    ) {
      res.status(400).json({ error: "Maximum purchase amount must be a non-negative whole number, or null for no limit." });
      return;
    }
    const effectiveMin = minPurchaseKobo ?? (await getPaymentSettings()).minPurchaseKobo;
    if (maxPurchaseKobo != null && maxPurchaseKobo < effectiveMin) {
      res.status(400).json({ error: "Maximum purchase amount cannot be lower than the minimum." });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (enabled !== undefined) patch.enabled = enabled;
    if (testMode !== undefined) patch.testMode = testMode;
    if (currency !== undefined) patch.currency = currency;
    if (taxPercent !== undefined) patch.taxPercent = taxPercent;
    if (feePercent !== undefined) patch.feePercent = feePercent;
    if (feeFlatKobo !== undefined) patch.feeFlatKobo = feeFlatKobo;
    if (minPurchaseKobo !== undefined) patch.minPurchaseKobo = minPurchaseKobo;
    if (maxPurchaseKobo !== undefined) patch.maxPurchaseKobo = maxPurchaseKobo;

    const updated = await updatePaymentSettings(patch, req.staffUser?.email);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update payment settings");
    res.status(500).json({ error: "Failed to update payment settings" });
  }
});

router.get("/admin/payment-health", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await getPaymentHealth());
  } catch (err) {
    logger.error({ err }, "Failed to compute payment health");
    res.status(500).json({ status: "error", checks: [], checkedAt: new Date().toISOString() });
  }
});

router.post("/admin/payment-actions/test-payment", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await runTestPayment());
  } catch (err) {
    logger.error({ err }, "Test payment action failed");
    res.status(500).json({ ok: false, message: "Test payment failed unexpectedly." });
  }
});

router.post("/admin/payment-actions/verify-api", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await verifyApiConnection());
  } catch (err) {
    logger.error({ err }, "Verify API action failed");
    res.status(500).json({ ok: false, message: "Verification failed unexpectedly." });
  }
});

router.post("/admin/payment-actions/verify-webhooks", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await verifyWebhooks());
  } catch (err) {
    logger.error({ err }, "Verify webhooks action failed");
    res.status(500).json({ ok: false, message: "Verification failed unexpectedly." });
  }
});

router.post("/admin/payment-actions/reload-config", requireAdmin, async (_req, res): Promise<void> => {
  try {
    invalidatePaymentSettingsCache();
    const settings = await getPaymentSettings();
    res.json({ ok: true, message: "Payment configuration reloaded from the database and environment.", settings });
  } catch (err) {
    logger.error({ err }, "Reload config action failed");
    res.status(500).json({ ok: false, message: "Reload failed unexpectedly." });
  }
});

router.post("/admin/payment-actions/refresh-cache", requireAdmin, async (_req, res): Promise<void> => {
  try {
    invalidatePaymentSettingsCache();
    res.json({ ok: true, message: "Payment settings cache cleared. The next request will read fresh values." });
  } catch (err) {
    logger.error({ err }, "Refresh cache action failed");
    res.status(500).json({ ok: false, message: "Refresh failed unexpectedly." });
  }
});

router.post("/admin/payment-actions/repair-config", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { changes } = await repairPaymentSettings(req.staffUser?.email);
    res.json({
      ok: true,
      message: changes.length > 0 ? `Repaired ${changes.length} issue(s).` : "No issues found — configuration is healthy.",
      changes,
    });
  } catch (err) {
    logger.error({ err }, "Repair config action failed");
    res.status(500).json({ ok: false, message: "Repair failed unexpectedly." });
  }
});

export default router;
