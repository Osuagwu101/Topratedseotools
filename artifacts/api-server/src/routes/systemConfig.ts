import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import {
  listConfigStatuses,
  setConfigValue,
  clearConfigValue,
  testConfigConnection,
  listAuditLog,
  getConfigDefinition,
} from "../lib/systemConfig";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.use("/admin/system-config", requireSuperAdmin);

router.get("/admin/system-config", async (_req, res): Promise<void> => {
  try {
    const statuses = await listConfigStatuses();
    res.json(statuses);
  } catch (err) {
    logger.error({ err }, "Failed to list system config");
    res.status(500).json({ error: "Failed to load configuration." });
  }
});

router.get("/admin/system-config/audit-log", async (_req, res): Promise<void> => {
  try {
    const rows = await listAuditLog();
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Failed to load config audit log");
    res.status(500).json({ error: "Failed to load audit log." });
  }
});

router.put("/admin/system-config/:key", async (req, res): Promise<void> => {
  const key = String(req.params.key);
  const def = getConfigDefinition(key);
  if (!def) {
    res.status(404).json({ error: "Unknown configuration key." });
    return;
  }
  if (def.envOnly) {
    res.status(400).json({ error: `${def.label} cannot be managed here — set it via Replit Secrets instead.` });
    return;
  }
  const { value } = req.body as { value?: unknown };
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "value is required." });
    return;
  }
  try {
    await setConfigValue(key, value.trim(), req.staffUser, req.ip);
    const [status] = (await listConfigStatuses()).filter((s) => s.key === key);
    res.json(status);
  } catch (err) {
    logger.error({ err, key }, "Failed to save system config value");
    res.status(500).json({ error: "Failed to save configuration." });
  }
});

router.delete("/admin/system-config/:key", async (req, res): Promise<void> => {
  const key = String(req.params.key);
  const def = getConfigDefinition(key);
  if (!def) {
    res.status(404).json({ error: "Unknown configuration key." });
    return;
  }
  if (def.required) {
    res.status(400).json({ error: "This value is required and cannot be cleared from here." });
    return;
  }
  if (def.envOnly) {
    res.status(400).json({ error: `${def.label} cannot be managed here — set it via Replit Secrets instead.` });
    return;
  }
  try {
    await clearConfigValue(key, req.staffUser, req.ip);
    const [status] = (await listConfigStatuses()).filter((s) => s.key === key);
    res.json(status);
  } catch (err) {
    logger.error({ err, key }, "Failed to clear system config value");
    res.status(500).json({ error: "Failed to clear configuration." });
  }
});

router.post("/admin/system-config/:key/test", async (req, res): Promise<void> => {
  const key = String(req.params.key);
  const def = getConfigDefinition(key);
  if (!def) {
    res.status(404).json({ error: "Unknown configuration key." });
    return;
  }
  try {
    const result = await testConfigConnection(key, req.staffUser, req.ip);
    res.json(result);
  } catch (err) {
    logger.error({ err, key }, "Failed to test system config connection");
    res.status(500).json({ ok: false, message: "Test failed unexpectedly." });
  }
});

export default router;
