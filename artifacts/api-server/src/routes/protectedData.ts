import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { listDatasetStatuses, unlockDataset, relockDataset, listUnlockLog, getDatasetDefinition } from "../lib/protectedData";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/protected-data", requireSuperAdmin);

router.get("/admin/protected-data", async (_req, res): Promise<void> => {
  try {
    res.json(await listDatasetStatuses());
  } catch (err) {
    logger.error({ err }, "Failed to list protected datasets");
    res.status(500).json({ error: "Failed to load protected data status." });
  }
});

router.get("/admin/protected-data/unlock-log", async (_req, res): Promise<void> => {
  try {
    res.json(await listUnlockLog());
  } catch (err) {
    logger.error({ err }, "Failed to load protected data unlock log");
    res.status(500).json({ error: "Failed to load unlock log." });
  }
});

router.post("/admin/protected-data/:key/unlock", async (req, res): Promise<void> => {
  const key = String(req.params.key);
  if (!getDatasetDefinition(key)) {
    res.status(404).json({ error: "Unknown protected dataset." });
    return;
  }
  const { reason } = req.body as { reason?: unknown };
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "A reason is required to unlock this dataset." });
    return;
  }
  try {
    const status = await unlockDataset(key, reason, req.staffUser, req.ip);
    res.json(status);
  } catch (err) {
    logger.error({ err, key }, "Failed to unlock protected dataset");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to unlock dataset." });
  }
});

router.post("/admin/protected-data/:key/relock", async (req, res): Promise<void> => {
  const key = String(req.params.key);
  if (!getDatasetDefinition(key)) {
    res.status(404).json({ error: "Unknown protected dataset." });
    return;
  }
  try {
    const status = await relockDataset(key, req.staffUser, req.ip);
    res.json(status);
  } catch (err) {
    logger.error({ err, key }, "Failed to relock protected dataset");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to relock dataset." });
  }
});

export default router;
