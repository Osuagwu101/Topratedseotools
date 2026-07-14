import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { BACKUP_SCOPES, createBackup, listBackups, getBackup, getBackupScopeDefinition } from "../lib/backupEngine";
import { getStorageBackend } from "../lib/storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/backups", requireSuperAdmin);

router.get("/admin/backups/scopes", (_req, res): void => {
  res.json(BACKUP_SCOPES);
});

router.get("/admin/backups", async (_req, res): Promise<void> => {
  try {
    res.json(await listBackups());
  } catch (err) {
    logger.error({ err }, "Failed to list backups");
    res.status(500).json({ error: "Failed to load backups." });
  }
});

router.post("/admin/backups", async (req, res): Promise<void> => {
  const { scope } = req.body as { scope?: unknown };
  if (typeof scope !== "string" || !getBackupScopeDefinition(scope)) {
    res.status(400).json({ error: `scope must be one of: ${BACKUP_SCOPES.map((s) => s.key).join(", ")}` });
    return;
  }
  try {
    const result = await createBackup({ scope: scope as never, trigger: "manual", actor: req.staffUser });
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err, scope }, "Failed to create backup");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create backup." });
  }
});

router.get("/admin/backups/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid backup id." });
    return;
  }
  try {
    const backup = await getBackup(id);
    if (!backup) {
      res.status(404).json({ error: "Backup not found." });
      return;
    }
    res.json(backup);
  } catch (err) {
    logger.error({ err, id }, "Failed to load backup");
    res.status(500).json({ error: "Failed to load backup." });
  }
});

router.get("/admin/backups/:id/download", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid backup id." });
    return;
  }
  try {
    const backup = await getBackup(id);
    if (!backup || backup.status !== "completed" || !backup.storagePath) {
      res.status(404).json({ error: "Backup artifact not found." });
      return;
    }
    const backend = await getStorageBackend();
    const result = await backend.getObjectStream(backup.storagePath);
    if (!result) {
      res.status(404).json({ error: "Backup artifact is missing from storage." });
      return;
    }
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="backup-${backup.scope}-${backup.id}.json.gz"`);
    result.stream.pipe(res);
  } catch (err) {
    logger.error({ err, id }, "Failed to download backup");
    res.status(500).json({ error: "Failed to download backup." });
  }
});

export default router;
