import { Router, type IRouter } from "express";
import type { StaffUser } from "@workspace/db";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  reloadProducts,
  restoreMissingProducts,
  rebuildProductIndex,
  verifyProductDatabase,
  repairProductRelationships,
  refreshProductCache,
  listProductRecoveryLog,
} from "../lib/productRecovery";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/product-recovery", requireSuperAdmin);

router.get("/admin/product-recovery/log", async (_req, res): Promise<void> => {
  try {
    res.json(await listProductRecoveryLog());
  } catch (err) {
    logger.error({ err }, "Failed to load product recovery log");
    res.status(500).json({ error: "Failed to load recovery log." });
  }
});

function register(path: string, actionLabel: string, fn: (actor: StaffUser | undefined, ip: string | undefined) => Promise<unknown>) {
  router.post(`/admin/product-recovery/${path}`, async (req, res): Promise<void> => {
    try {
      const result = await fn(req.staffUser, req.ip);
      res.json(result);
    } catch (err) {
      logger.error({ err }, `Product recovery action failed: ${actionLabel}`);
      res.status(500).json({ error: err instanceof Error ? err.message : `Failed to run ${actionLabel}.` });
    }
  });
}

register("reload", "reload products", reloadProducts);
register("restore-missing", "restore missing products", restoreMissingProducts);
register("rebuild-index", "rebuild product index", rebuildProductIndex);
register("verify", "verify product database", verifyProductDatabase);
register("repair-relationships", "repair product relationships", repairProductRelationships);
register("refresh-cache", "refresh product cache", refreshProductCache);

export default router;
