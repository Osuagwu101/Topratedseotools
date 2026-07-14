import { Router, type IRouter } from "express";
import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/staffAuth";
import { clearAllCaches, rebuildAllCaches, refreshProducts, refreshAiConfiguration, refreshWebsite } from "../lib/cacheMaintenance";
import { logger } from "../lib/logger";

const router: IRouter = Router();

class MutualExclusionError extends Error {}

router.post("/admin/cache/clear", requireSuperAdmin, async (_req, res): Promise<void> => {
  res.json(clearAllCaches());
});

router.post("/admin/cache/rebuild", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await rebuildAllCaches());
  } catch (err) {
    logger.error({ err }, "Failed to rebuild caches");
    res.status(500).json({ error: "Failed to rebuild caches" });
  }
});

router.post("/admin/cache/refresh-products", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await refreshProducts());
  } catch (err) {
    logger.error({ err }, "Failed to refresh products");
    res.status(500).json({ error: "Failed to refresh products" });
  }
});

router.post("/admin/cache/refresh-ai", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await refreshAiConfiguration());
  } catch (err) {
    logger.error({ err }, "Failed to refresh AI configuration");
    res.status(500).json({ error: "Failed to refresh AI configuration" });
  }
});

router.post("/admin/cache/refresh-website", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await refreshWebsite());
  } catch (err) {
    logger.error({ err }, "Failed to refresh website cache");
    res.status(500).json({ error: "Failed to refresh website cache" });
  }
});

// ── Maintenance / Coming Soon / Read-Only mode toggles ──────────────────────
// Lives here rather than featureFlags.ts because it's part of the Cache &
// Maintenance Centre's UI/workflow, even though it's stored in the same
// feature_flags row as the other kill switches.
async function ensureFlags() {
  const rows = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
  if (rows.length > 0) return rows[0];
  await db.insert(featureFlagsTable).values({ id: 1 }).onConflictDoNothing();
  const created = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
  return created[0];
}

router.get("/admin/maintenance-modes", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const flags = await ensureFlags();
    res.json({
      maintenanceMode: flags.maintenanceMode,
      comingSoonMode: flags.comingSoonMode,
      readOnlyMode: flags.readOnlyMode,
      maintenanceMessage: flags.maintenanceMessage,
    });
  } catch (err) {
    logger.error({ err }, "Failed to load maintenance modes");
    res.status(500).json({ error: "Failed to load maintenance modes" });
  }
});

router.put("/admin/maintenance-modes", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const { maintenanceMode, comingSoonMode, readOnlyMode, maintenanceMessage } = req.body as {
      maintenanceMode?: boolean;
      comingSoonMode?: boolean;
      readOnlyMode?: boolean;
      maintenanceMessage?: string | null;
    };
    for (const [key, value] of Object.entries({ maintenanceMode, comingSoonMode, readOnlyMode })) {
      if (value !== undefined && typeof value !== "boolean") {
        res.status(400).json({ error: `${key} must be a boolean.` });
        return;
      }
    }
    if (maintenanceMessage !== undefined && maintenanceMessage !== null && typeof maintenanceMessage !== "string") {
      res.status(400).json({ error: "maintenanceMessage must be a string or null." });
      return;
    }
    // Maintenance Mode and Coming Soon Mode are mutually exclusive takeover
    // screens — enabling one while the other is already on would leave the
    // storefront in an undefined state (which page wins?). Reject rather
    // than silently pick one.
    //
    // The read-validate-write below runs inside a transaction with a
    // row-level lock (SELECT ... FOR UPDATE) on the single feature_flags
    // row, so two concurrent PUTs can't both read the same "before" state
    // and each independently pass the mutual-exclusion check — the second
    // request blocks until the first commits, then re-validates against the
    // now-current state.
    await ensureFlags();
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(featureFlagsTable)
        .where(eq(featureFlagsTable.id, 1))
        .for("update");
      const nextMaintenance = maintenanceMode ?? current.maintenanceMode;
      const nextComingSoon = comingSoonMode ?? current.comingSoonMode;
      if (nextMaintenance && nextComingSoon) {
        throw new MutualExclusionError();
      }

      const updates: Partial<typeof featureFlagsTable.$inferInsert> = {
        updatedAt: new Date(),
        updatedBy: (req.headers["x-admin-user"] as string | undefined) ?? "admin",
      };
      if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
      if (comingSoonMode !== undefined) updates.comingSoonMode = comingSoonMode;
      if (readOnlyMode !== undefined) updates.readOnlyMode = readOnlyMode;
      if (maintenanceMessage !== undefined) updates.maintenanceMessage = maintenanceMessage;

      await tx.update(featureFlagsTable).set(updates).where(eq(featureFlagsTable.id, 1));
      const [row] = await tx.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
      return row;
    });
    res.json({
      maintenanceMode: updated.maintenanceMode,
      comingSoonMode: updated.comingSoonMode,
      readOnlyMode: updated.readOnlyMode,
      maintenanceMessage: updated.maintenanceMessage,
    });
  } catch (err) {
    if (err instanceof MutualExclusionError) {
      res.status(400).json({ error: "Maintenance Mode and Coming Soon Mode cannot both be enabled at once." });
      return;
    }
    logger.error({ err }, "Failed to update maintenance modes");
    res.status(500).json({ error: "Failed to update maintenance modes" });
  }
});

export default router;
