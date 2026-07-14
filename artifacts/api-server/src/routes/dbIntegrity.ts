import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { listChecks, runScan, repairFinding, listAuditLog } from "../lib/dbIntegrity";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/db-integrity", requireSuperAdmin);

router.get("/admin/db-integrity/checks", (_req, res): void => {
  res.json(listChecks());
});

router.get("/admin/db-integrity/audit-log", async (_req, res): Promise<void> => {
  try {
    res.json(await listAuditLog());
  } catch (err) {
    logger.error({ err }, "Failed to load integrity audit log");
    res.status(500).json({ error: "Failed to load audit log." });
  }
});

router.post("/admin/db-integrity/scan", async (req, res): Promise<void> => {
  try {
    const report = await runScan(req.staffUser, req.ip);
    res.json(report);
  } catch (err) {
    logger.error({ err }, "Failed to run database integrity scan");
    res.status(500).json({ error: "Failed to run scan." });
  }
});

router.post("/admin/db-integrity/repair/:checkKey", async (req, res): Promise<void> => {
  const checkKey = String(req.params.checkKey);
  try {
    const outcome = await repairFinding(checkKey, req.staffUser, req.ip);
    if (outcome.status === "blocked") {
      res.status(423).json(outcome);
      return;
    }
    if (outcome.status === "not_repairable" || outcome.status === "not_found") {
      res.status(400).json(outcome);
      return;
    }
    res.json(outcome);
  } catch (err) {
    logger.error({ err, checkKey }, "Failed to apply integrity repair");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to apply repair." });
  }
});

export default router;
