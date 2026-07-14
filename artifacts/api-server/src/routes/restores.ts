import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { listRestorableBackups, previewRestore, executeRestore, listRestores, getRestore, getScopeDatasets } from "../lib/restoreEngine";
import { getBackupScopeDefinition } from "../lib/backupEngine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/restores", requireSuperAdmin);

// Backups eligible to restore from, enriched with the protected datasets each scope touches.
router.get("/admin/restores/backups", async (_req, res): Promise<void> => {
  try {
    const backups = await listRestorableBackups();
    const enriched = backups.map((b) => ({
      ...b,
      scopeLabel: getBackupScopeDefinition(b.scope)?.label ?? b.scope,
      affectedDatasets: getScopeDatasets(b.scope as never),
    }));
    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "Failed to list restorable backups");
    res.status(500).json({ error: "Failed to load restorable backups." });
  }
});

router.get("/admin/restores/history", async (_req, res): Promise<void> => {
  try {
    res.json(await listRestores());
  } catch (err) {
    logger.error({ err }, "Failed to list restore history");
    res.status(500).json({ error: "Failed to load restore history." });
  }
});

router.get("/admin/restores/:backupId/preview", async (req, res): Promise<void> => {
  const backupId = Number(req.params.backupId);
  if (!Number.isInteger(backupId)) {
    res.status(400).json({ error: "Invalid backup id." });
    return;
  }
  try {
    const preview = await previewRestore(backupId);
    res.json(preview);
  } catch (err) {
    logger.error({ err, backupId }, "Failed to preview restore");
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to preview restore." });
  }
});

router.post("/admin/restores/:backupId", async (req, res): Promise<void> => {
  const backupId = Number(req.params.backupId);
  if (!Number.isInteger(backupId)) {
    res.status(400).json({ error: "Invalid backup id." });
    return;
  }
  const { confirm, confirmCrossEnvironment } = req.body as { confirm?: unknown; confirmCrossEnvironment?: unknown };
  if (confirm !== true) {
    res.status(400).json({ error: "Restoring requires explicit confirmation (confirm: true)." });
    return;
  }
  try {
    const outcome = await executeRestore({
      backupId,
      actor: req.staffUser,
      confirmCrossEnvironment: confirmCrossEnvironment === true,
      ipAddress: req.ip,
    });
    if (outcome.status === "blocked") {
      res.status(423).json(outcome);
      return;
    }
    if (outcome.status === "failed") {
      res.status(500).json(outcome);
      return;
    }
    res.status(200).json(outcome);
  } catch (err) {
    logger.error({ err, backupId }, "Failed to execute restore");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to execute restore." });
  }
});

router.get("/admin/restores/status/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid restore id." });
    return;
  }
  try {
    const row = await getRestore(id);
    if (!row) {
      res.status(404).json({ error: "Restore not found." });
      return;
    }
    res.json(row);
  } catch (err) {
    logger.error({ err, id }, "Failed to load restore");
    res.status(500).json({ error: "Failed to load restore." });
  }
});

export default router;
