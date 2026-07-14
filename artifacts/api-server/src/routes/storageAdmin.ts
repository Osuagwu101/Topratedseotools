import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { getStorageSummary, deleteUnusedFiles, optimizeStorage, invalidateStorageCache } from "../lib/storageAdmin";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/admin/storage", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const summary = await getStorageSummary(forceRefresh);
    res.json(summary);
  } catch (err) {
    logger.error({ err }, "Failed to load storage summary");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load storage summary" });
  }
});

router.post("/admin/storage/clear-cache", requireSuperAdmin, async (_req, res): Promise<void> => {
  invalidateStorageCache();
  res.json({ ok: true, detail: "Cleared the cached storage listing. The next load will re-scan the bucket." });
});

router.post("/admin/storage/delete-unused", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const result = await deleteUnusedFiles();
    logger.info({ staffId: req.staffUser?.id, result }, "Deleted unused storage files");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to delete unused files");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete unused files" });
  }
});

router.post("/admin/storage/optimize", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const result = await optimizeStorage();
    logger.info({ staffId: req.staffUser?.id, result }, "Optimized storage (removed duplicate unused files)");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to optimize storage");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to optimize storage" });
  }
});

export default router;
