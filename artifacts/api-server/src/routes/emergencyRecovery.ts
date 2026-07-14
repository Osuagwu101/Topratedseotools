import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  verifyAllServices,
  reloadConfiguration,
  repairConfiguration,
  refreshApiConnections,
  verifyService,
  type VerifiableService,
} from "../lib/emergencyRecovery";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const VERIFIABLE: VerifiableService[] = ["payment", "authentication", "ai", "email"];

router.post("/admin/recovery/verify-all", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await verifyAllServices());
  } catch (err) {
    logger.error({ err }, "Emergency recovery: verify-all failed");
    res.status(500).json({ error: "Failed to verify services" });
  }
});

router.post("/admin/recovery/reload-configuration", requireSuperAdmin, async (req, res): Promise<void> => {
  const result = await reloadConfiguration();
  logger.info({ staffId: req.staffUser?.id, result }, "Emergency recovery: reload configuration");
  res.json(result);
});

router.post("/admin/recovery/repair-configuration", requireSuperAdmin, async (req, res): Promise<void> => {
  const result = await repairConfiguration();
  logger.info({ staffId: req.staffUser?.id, result }, "Emergency recovery: repair configuration");
  res.json(result);
});

router.post("/admin/recovery/refresh-connections", requireSuperAdmin, async (req, res): Promise<void> => {
  const result = await refreshApiConnections();
  logger.info({ staffId: req.staffUser?.id, result }, "Emergency recovery: refresh API connections");
  res.json(result);
});

router.post("/admin/recovery/verify/:service", requireSuperAdmin, async (req, res): Promise<void> => {
  const service = req.params.service as VerifiableService;
  if (!VERIFIABLE.includes(service)) {
    res.status(400).json({ error: `Unknown service. Expected one of: ${VERIFIABLE.join(", ")}` });
    return;
  }
  try {
    res.json(await verifyService(service));
  } catch (err) {
    logger.error({ err, service }, "Emergency recovery: per-service verify failed");
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
