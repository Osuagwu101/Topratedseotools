import { Router, type IRouter } from "express";
import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireSuperAdmin } from "../lib/staffAuth";

const router: IRouter = Router();

async function ensureFlags() {
  const rows = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(featureFlagsTable).values({ id: 1 });
    const newRows = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
    return newRows[0];
  }
  return rows[0];
}

// Public — the storefront needs this (unauthenticated) to decide whether to
// show/hide nav links, gate routes, etc. Never expose anything beyond the
// flags themselves here.
router.get("/feature-flags", async (_req, res): Promise<void> => {
  try {
    const flags = await ensureFlags();
    res.json(flags);
  } catch (err) {
    logger.error({ err }, "Failed to fetch feature flags");
    res.status(500).json({ error: "Failed to fetch feature flags" });
  }
});

router.get("/admin/feature-flags", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const flags = await ensureFlags();
    res.json(flags);
  } catch (err) {
    logger.error({ err }, "Failed to fetch feature flags");
    res.status(500).json({ error: "Failed to fetch feature flags" });
  }
});

router.put("/admin/feature-flags", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const {
      marketplaceEnabled,
      aiToolsEnabled,
      registrationEnabled,
      loginEnabled,
      guestCheckoutEnabled,
      oneClickAuthEnabled,
    } = req.body as {
      marketplaceEnabled?: boolean;
      aiToolsEnabled?: boolean;
      registrationEnabled?: boolean;
      loginEnabled?: boolean;
      guestCheckoutEnabled?: boolean;
      oneClickAuthEnabled?: boolean;
    };

    const fields = {
      marketplaceEnabled,
      aiToolsEnabled,
      registrationEnabled,
      loginEnabled,
      guestCheckoutEnabled,
      oneClickAuthEnabled,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && typeof value !== "boolean") {
        res.status(400).json({ error: `${key} must be a boolean.` });
        return;
      }
    }

    await ensureFlags();

    const updates: Partial<typeof featureFlagsTable.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: (req.headers["x-admin-user"] as string | undefined) ?? "admin",
    };
    if (marketplaceEnabled !== undefined) updates.marketplaceEnabled = marketplaceEnabled;
    if (aiToolsEnabled !== undefined) updates.aiToolsEnabled = aiToolsEnabled;
    if (registrationEnabled !== undefined) updates.registrationEnabled = registrationEnabled;
    if (loginEnabled !== undefined) updates.loginEnabled = loginEnabled;
    if (guestCheckoutEnabled !== undefined) updates.guestCheckoutEnabled = guestCheckoutEnabled;
    if (oneClickAuthEnabled !== undefined) updates.oneClickAuthEnabled = oneClickAuthEnabled;

    await db.update(featureFlagsTable).set(updates).where(eq(featureFlagsTable.id, 1));
    const updated = await db.select().from(featureFlagsTable).where(eq(featureFlagsTable.id, 1));
    res.json(updated[0]);
  } catch (err) {
    logger.error({ err }, "Failed to update feature flags");
    res.status(500).json({ error: "Failed to update feature flags" });
  }
});

export default router;
