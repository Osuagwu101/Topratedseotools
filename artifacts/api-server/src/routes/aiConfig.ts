import { Router, type IRouter } from "express";
import { db, seoGeneratorSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/staffAuth";
import { logger } from "../lib/logger";
import { AI_PROVIDERS, resolveModel } from "../lib/seoGenerator/aiClient";
import { ALLOWED_AI_MODELS } from "../lib/openaiClient";
import { ALLOWED_GEMINI_MODELS } from "../lib/geminiClient";
import { testConfigConnection } from "../lib/systemConfig";
import { getAiHealth } from "../lib/aiHealth";
import { requireOperationClearance } from "../lib/deploymentSafety";

// Dedicated top-level "AI Configuration Centre" for Super Admin -- reads and
// writes the exact same singleton seo_generator_settings row the Blog AI
// Generator's embedded settings panel uses (single source of truth), so a
// change made here takes effect immediately for blog generation and
// vice versa. Values that are secrets (the API keys themselves) stay in the
// System Configuration Centre's encrypted vault; this only manages the
// non-secret provider/enable/model/limit knobs.
const router: IRouter = Router();
router.use("/admin/ai-config", requireSuperAdmin);

const DEFAULTS = {
  aiProvider: "openai" as const,
  aiModel: "gpt-4o-mini",
  geminiModel: "gemini-flash-latest",
  openaiEnabled: true,
  geminiEnabled: true,
  temperature: 0.7,
  maxTokens: 4096,
  perUserDailyLimit: 10,
  monthlyGenerationLimit: 200,
  warningThresholdPercent: 80,
};

async function getOrCreateSettings() {
  const [row] = await db.select().from(seoGeneratorSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(seoGeneratorSettingsTable).values({}).returning();
  return created;
}

function serialize(settings: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  const { serpApiKey: _serpApiKey, serpProvider: _serpProvider, ...rest } = settings;
  return {
    ...rest,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    providers: AI_PROVIDERS,
    openAiModels: ALLOWED_AI_MODELS,
    geminiModels: ALLOWED_GEMINI_MODELS,
  };
}

router.get("/admin/ai-config", async (_req, res): Promise<void> => {
  try {
    res.json(serialize(await getOrCreateSettings()));
  } catch (err) {
    logger.error({ err }, "Failed to fetch AI configuration");
    res.status(500).json({ error: "Failed to fetch AI configuration" });
  }
});

router.put("/admin/ai-config", async (req, res): Promise<void> => {
  try {
    const current = await getOrCreateSettings();
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: req.staffUser?.id };

    if (body.aiProvider === "openai" || body.aiProvider === "gemini") updates.aiProvider = body.aiProvider;
    if (typeof body.aiModel === "string") updates.aiModel = resolveModel("openai", body.aiModel);
    if (typeof body.geminiModel === "string") updates.geminiModel = resolveModel("gemini", body.geminiModel);
    if (typeof body.openaiEnabled === "boolean") updates.openaiEnabled = body.openaiEnabled;
    if (typeof body.geminiEnabled === "boolean") updates.geminiEnabled = body.geminiEnabled;
    if (typeof body.temperature === "number" && Number.isFinite(body.temperature)) {
      updates.temperature = Math.min(2, Math.max(0, body.temperature));
    }
    if (typeof body.maxTokens === "number" && Number.isInteger(body.maxTokens)) {
      updates.maxTokens = Math.min(16000, Math.max(256, body.maxTokens));
    }
    if (typeof body.perUserDailyLimit === "number" && Number.isInteger(body.perUserDailyLimit)) {
      updates.perUserDailyLimit = Math.max(1, body.perUserDailyLimit);
    }
    if (typeof body.monthlyGenerationLimit === "number" && Number.isInteger(body.monthlyGenerationLimit)) {
      updates.monthlyGenerationLimit = Math.max(1, body.monthlyGenerationLimit);
    }
    if (typeof body.warningThresholdPercent === "number" && Number.isFinite(body.warningThresholdPercent)) {
      updates.warningThresholdPercent = Math.min(100, Math.max(1, Math.round(body.warningThresholdPercent)));
    }

    if (updates.openaiEnabled === false && (updates.geminiEnabled ?? current.geminiEnabled) === false) {
      res.status(400).json({ error: "At least one provider must stay enabled, or generation will be unavailable entirely." });
      return;
    }

    const [updated] = await db
      .update(seoGeneratorSettingsTable)
      .set(updates as never)
      .where(eq(seoGeneratorSettingsTable.id, current.id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    logger.error({ err }, "Failed to update AI configuration");
    res.status(500).json({ error: "Failed to update AI configuration" });
  }
});

// Resets AI generator settings to defaults — gated behind the "ai_settings"
// protected dataset (Protected Data centre).
router.post("/admin/ai-config/reset-default", requireOperationClearance("reset_ai_settings"), async (req, res): Promise<void> => {
  try {
    const current = await getOrCreateSettings();
    const [updated] = await db
      .update(seoGeneratorSettingsTable)
      .set({ ...DEFAULTS, updatedAt: new Date(), updatedBy: req.staffUser?.id })
      .where(eq(seoGeneratorSettingsTable.id, current.id))
      .returning();
    res.json(serialize(updated));
  } catch (err) {
    logger.error({ err }, "Failed to reset AI configuration to defaults");
    res.status(500).json({ error: "Failed to reset AI configuration" });
  }
});

router.post("/admin/ai-config/test/:provider", async (req, res): Promise<void> => {
  const provider = String(req.params.provider);
  const key = provider === "openai" ? "OPENAI_API_KEY" : provider === "gemini" ? "GEMINI_API_KEY" : null;
  if (!key) {
    res.status(400).json({ ok: false, message: "Unknown provider." });
    return;
  }
  try {
    const result = await testConfigConnection(key, req.staffUser, req.ip);
    res.json(result);
  } catch (err) {
    logger.error({ err, provider }, "AI connection test failed");
    res.status(500).json({ ok: false, message: "Test failed unexpectedly." });
  }
});

router.get("/admin/ai-config/health", async (_req, res): Promise<void> => {
  try {
    res.json(await getAiHealth());
  } catch (err) {
    logger.error({ err }, "Failed to compute AI health");
    res.status(500).json({ status: "error", checks: [], checkedAt: new Date().toISOString() });
  }
});

export default router;
