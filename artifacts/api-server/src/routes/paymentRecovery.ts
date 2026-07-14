import { Router, type IRouter } from "express";
import type { StaffUser } from "@workspace/db";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  verifyGateway,
  repairPaymentConfiguration,
  verifyWebhooksAction,
  verifyTransactionRecords,
  reloadPaymentServices,
  reconnectPaymentGateway,
  listPaymentRecoveryLog,
} from "../lib/paymentRecovery";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/payment-recovery", requireSuperAdmin);

router.get("/admin/payment-recovery/log", async (_req, res): Promise<void> => {
  try {
    res.json(await listPaymentRecoveryLog());
  } catch (err) {
    logger.error({ err }, "Failed to load payment recovery log");
    res.status(500).json({ error: "Failed to load recovery log." });
  }
});

function register(path: string, actionLabel: string, fn: (actor: StaffUser | undefined, ip: string | undefined) => Promise<unknown>) {
  router.post(`/admin/payment-recovery/${path}`, async (req, res): Promise<void> => {
    try {
      const result = await fn(req.staffUser, req.ip);
      res.json(result);
    } catch (err) {
      logger.error({ err }, `Payment recovery action failed: ${actionLabel}`);
      res.status(500).json({ error: err instanceof Error ? err.message : `Failed to run ${actionLabel}.` });
    }
  });
}

register("verify-gateway", "verify gateway", verifyGateway);
register("repair-configuration", "repair payment configuration", repairPaymentConfiguration);
register("verify-webhooks", "verify webhooks", verifyWebhooksAction);
register("verify-transactions", "verify transaction records", verifyTransactionRecords);
register("reload", "reload payment services", reloadPaymentServices);
register("reconnect", "reconnect payment gateway", reconnectPaymentGateway);

export default router;
