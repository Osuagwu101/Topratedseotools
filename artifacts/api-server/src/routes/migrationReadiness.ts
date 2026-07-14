import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { getMigrationReadinessReport, validateMigrationAgainstBackup } from "../lib/migrationReadiness";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/migration-readiness", requireSuperAdmin);

router.get("/admin/migration-readiness", async (_req, res): Promise<void> => {
  try {
    res.json(await getMigrationReadinessReport());
  } catch (err) {
    logger.error({ err }, "Failed to build migration readiness report");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build migration readiness report." });
  }
});

router.post("/admin/migration-readiness/validate/:backupId", async (req, res): Promise<void> => {
  const backupId = Number(req.params.backupId);
  if (!Number.isInteger(backupId)) {
    res.status(400).json({ error: "Invalid backup id." });
    return;
  }
  try {
    const report = await validateMigrationAgainstBackup(backupId);
    logger.info({ staffId: req.staffUser?.id, backupId, overallStatus: report.overallStatus }, "Ran migration validation against backup");
    res.json(report);
  } catch (err) {
    logger.error({ err, backupId }, "Failed to validate migration against backup");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to validate migration against backup." });
  }
});

export default router;
