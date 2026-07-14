import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { getDeploymentSafetySummary, assessOperationRisk, getRiskyOperationDefinition } from "../lib/deploymentSafety";
import { listUnlockLog } from "../lib/protectedData";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/deployment-safety", requireSuperAdmin);

router.get("/admin/deployment-safety", async (_req, res): Promise<void> => {
  try {
    res.json(await getDeploymentSafetySummary());
  } catch (err) {
    logger.error({ err }, "Failed to load deployment safety summary");
    res.status(500).json({ error: "Failed to load deployment safety status." });
  }
});

router.get("/admin/deployment-safety/audit-log", async (_req, res): Promise<void> => {
  try {
    res.json(await listUnlockLog());
  } catch (err) {
    logger.error({ err }, "Failed to load deployment safety audit log");
    res.status(500).json({ error: "Failed to load audit log." });
  }
});

// Read-only "what will this affect?" preview an admin can call before
// confirming a risky action — does not perform or gate the action itself.
router.get("/admin/deployment-safety/check/:operationKey", async (req, res): Promise<void> => {
  const key = String(req.params.operationKey);
  if (!getRiskyOperationDefinition(key)) {
    res.status(404).json({ error: "Unknown risky operation." });
    return;
  }
  try {
    res.json(await assessOperationRisk(key));
  } catch (err) {
    logger.error({ err, key }, "Failed to assess operation risk");
    res.status(500).json({ error: "Failed to assess operation risk." });
  }
});

export default router;
