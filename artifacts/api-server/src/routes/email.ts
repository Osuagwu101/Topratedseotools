import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/staffAuth";
import { logger } from "../lib/logger";
import { getEmailSettings, updateEmailSettings, recordTestEmailResult } from "../lib/emailSettings";
import { sendTestEmail, verifyEmailConfiguration } from "../lib/emailClient";
import { getEmailHealth } from "../lib/emailHealth";
import { getConfigValue } from "../lib/systemConfig";

// Top-level "Email Configuration Centre" for Super Admin, covering Resend
// sender identity + send toggle. The RESEND_API_KEY secret itself is managed
// in the System Configuration Centre's encrypted vault (already registered
// there); this only manages non-secret operational settings plus the
// Test Email / Verify Configuration actions.
const router: IRouter = Router();
router.use("/admin/email-config", requireSuperAdmin);

router.get("/admin/email-config", async (_req, res): Promise<void> => {
  try {
    const settings = await getEmailSettings();
    const hasApiKey = Boolean(await getConfigValue("RESEND_API_KEY"));
    res.json({ ...settings, hasApiKey });
  } catch (err) {
    logger.error({ err }, "Failed to fetch email configuration");
    res.status(500).json({ error: "Failed to fetch email configuration" });
  }
});

router.put("/admin/email-config", async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.senderEmail === "string") {
      const value = body.senderEmail.trim();
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        res.status(400).json({ error: "Sender email does not look like a valid email address." });
        return;
      }
      patch.senderEmail = value || null;
    }
    if (typeof body.senderName === "string") patch.senderName = body.senderName.trim() || null;
    if (typeof body.replyToEmail === "string") {
      const value = body.replyToEmail.trim();
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        res.status(400).json({ error: "Reply-to email does not look like a valid email address." });
        return;
      }
      patch.replyToEmail = value || null;
    }

    const updated = await updateEmailSettings(patch, req.staffUser?.email);
    const hasApiKey = Boolean(await getConfigValue("RESEND_API_KEY"));
    res.json({ ...updated, hasApiKey });
  } catch (err) {
    logger.error({ err }, "Failed to update email configuration");
    res.status(500).json({ error: "Failed to update email configuration" });
  }
});

router.post("/admin/email-config/test-email", async (req, res): Promise<void> => {
  const { to } = req.body as { to?: string };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ ok: false, message: "A valid recipient email address is required." });
    return;
  }
  try {
    const result = await sendTestEmail(to);
    await recordTestEmailResult(result.ok, result.message, to);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Test email send failed");
    res.status(500).json({ ok: false, message: "Test email failed unexpectedly." });
  }
});

router.post("/admin/email-config/verify", async (_req, res): Promise<void> => {
  try {
    res.json(await verifyEmailConfiguration());
  } catch (err) {
    logger.error({ err }, "Email configuration verification failed");
    res.status(500).json({ ok: false, message: "Verification failed unexpectedly." });
  }
});

router.get("/admin/email-config/health", async (_req, res): Promise<void> => {
  try {
    res.json(await getEmailHealth());
  } catch (err) {
    logger.error({ err }, "Failed to compute email health");
    res.status(500).json({ status: "error", checks: [], checkedAt: new Date().toISOString() });
  }
});

export default router;
