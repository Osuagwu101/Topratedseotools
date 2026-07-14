import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { requireOperationClearance } from "../lib/deploymentSafety";
import {
  getStorageSummary,
  deleteUnusedFiles,
  optimizeStorage,
  invalidateStorageCache,
  invalidateStorageBackendCache,
} from "../lib/storageAdmin";
import { getStorageSettings, updateStorageSettings, buildStorageBackendForPreflight, type StorageBackendKind } from "../lib/storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_BACKENDS: StorageBackendKind[] = ["replit", "s3", "local"];

// ── Storage backend selection (portability) ──────────────────────────────
// Lets a Super Admin switch which storage provider new uploads use — the
// whole point of this endpoint existing is that moving hosts should never
// require a code change, only a config change here (or via env vars).
router.get("/admin/storage/settings", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const settings = await getStorageSettings();
    res.json(settings);
  } catch (err) {
    logger.error({ err }, "Failed to load storage settings");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load storage settings" });
  }
});

router.put("/admin/storage/settings", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      backend?: unknown;
      localDir?: unknown;
      s3Bucket?: unknown;
      s3Region?: unknown;
      s3Endpoint?: unknown;
      s3ForcePathStyle?: unknown;
      s3PublicBaseUrl?: unknown;
    };
    const patch: Partial<{
      backend: string;
      localDir: string;
      s3Bucket: string | null;
      s3Region: string | null;
      s3Endpoint: string | null;
      s3ForcePathStyle: boolean;
      s3PublicBaseUrl: string | null;
    }> = {};

    if (body.backend !== undefined) {
      if (typeof body.backend !== "string" || !VALID_BACKENDS.includes(body.backend as StorageBackendKind)) {
        res.status(400).json({ error: `backend must be one of: ${VALID_BACKENDS.join(", ")}` });
        return;
      }
      patch.backend = body.backend;
    }
    if (body.localDir !== undefined) {
      if (typeof body.localDir !== "string" || !body.localDir.trim()) {
        res.status(400).json({ error: "localDir must be a non-empty string" });
        return;
      }
      patch.localDir = body.localDir.trim();
    }
    if (body.s3Bucket !== undefined) patch.s3Bucket = typeof body.s3Bucket === "string" ? body.s3Bucket.trim() || null : null;
    if (body.s3Region !== undefined) patch.s3Region = typeof body.s3Region === "string" ? body.s3Region.trim() || null : null;
    if (body.s3Endpoint !== undefined) patch.s3Endpoint = typeof body.s3Endpoint === "string" ? body.s3Endpoint.trim() || null : null;
    if (body.s3ForcePathStyle !== undefined) patch.s3ForcePathStyle = body.s3ForcePathStyle === true;
    if (body.s3PublicBaseUrl !== undefined)
      patch.s3PublicBaseUrl = typeof body.s3PublicBaseUrl === "string" ? body.s3PublicBaseUrl.trim() || null : null;

    // Switching backend takes effect immediately, but never migrates
    // existing files — an admin switching from "replit" to "s3" must move
    // any already-uploaded objects themselves (only one backend is ever
    // "live" for reads at a time; there is no automatic fallback to the
    // previous backend). We can't block a legitimate two-step setup (e.g.
    // pick "s3" here, then add the access key/secret in the System
    // Configuration Centre afterwards), so instead of rejecting an
    // unreachable config outright, we preflight-check it and always report
    // the result back so the admin knows immediately whether uploads will
    // actually work right now, rather than discovering a broken backend
    // the next time someone uploads a file.
    const updated = await updateStorageSettings(patch, req.staffUser?.email);
    invalidateStorageBackendCache();
    logger.info({ staffId: req.staffUser?.id, backend: updated.backend }, "Updated storage backend settings");

    let health: { ok: boolean; message: string };
    try {
      const candidate = await buildStorageBackendForPreflight(updated);
      health = await candidate.checkHealth();
    } catch (err) {
      health = { ok: false, message: err instanceof Error ? err.message : "Could not verify this backend." };
    }
    res.json({ ...updated, health });
  } catch (err) {
    logger.error({ err }, "Failed to update storage settings");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update storage settings" });
  }
});

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

// Deletes files from the storage backend — gated behind the "downloads"
// protected dataset (Protected Data centre) since it removes objects that
// may back customer downloads.
router.post("/admin/storage/delete-unused", requireSuperAdmin, requireOperationClearance("delete_unused_storage"), async (req, res): Promise<void> => {
  try {
    const result = await deleteUnusedFiles();
    logger.info({ staffId: req.staffUser?.id, result }, "Deleted unused storage files");
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to delete unused files");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete unused files" });
  }
});

router.post("/admin/storage/optimize", requireSuperAdmin, requireOperationClearance("optimize_storage"), async (req, res): Promise<void> => {
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
