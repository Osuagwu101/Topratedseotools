import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { getAuthHealth } from "../lib/authHealth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/admin/auth-manager", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const health = await getAuthHealth();
    res.json(health);
  } catch (err) {
    logger.error({ err }, "Failed to load authentication manager status");
    res.status(500).json({ error: "Failed to load authentication status" });
  }
});

export default router;
