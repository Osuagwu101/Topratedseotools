import { Router, type IRouter } from "express";
import type { StaffUser } from "@workspace/db";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  verifyUsers,
  verifyPurchases,
  verifySubscriptions,
  verifyDownloads,
  verifyEntitlements,
  listCustomerRecoveryLog,
} from "../lib/customerRecovery";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/customer-recovery", requireSuperAdmin);

router.get("/admin/customer-recovery/log", async (_req, res): Promise<void> => {
  try {
    res.json(await listCustomerRecoveryLog());
  } catch (err) {
    logger.error({ err }, "Failed to load customer recovery log");
    res.status(500).json({ error: "Failed to load recovery log." });
  }
});

function register(path: string, actionLabel: string, fn: (actor: StaffUser | undefined, ip: string | undefined) => Promise<unknown>) {
  router.post(`/admin/customer-recovery/${path}`, async (req, res): Promise<void> => {
    try {
      const result = await fn(req.staffUser, req.ip);
      res.json(result);
    } catch (err) {
      logger.error({ err }, `Customer recovery action failed: ${actionLabel}`);
      res.status(500).json({ error: err instanceof Error ? err.message : `Failed to run ${actionLabel}.` });
    }
  });
}

register("verify-users", "verify users", verifyUsers);
register("verify-purchases", "verify purchases", verifyPurchases);
register("verify-subscriptions", "verify subscriptions", verifySubscriptions);
register("verify-downloads", "verify downloads", verifyDownloads);
register("verify-entitlements", "verify entitlements", verifyEntitlements);

export default router;
