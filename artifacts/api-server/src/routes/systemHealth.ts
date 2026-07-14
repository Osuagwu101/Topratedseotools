import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { getSystemHealth } from "../lib/systemHealth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/admin/system-health", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const report = await getSystemHealth();
    res.json(report);
  } catch (err) {
    logger.error({ err }, "Failed to compute system health");
    res.status(500).json({ error: "Failed to compute system health" });
  }
});

export default router;
