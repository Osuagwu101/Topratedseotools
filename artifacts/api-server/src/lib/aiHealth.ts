import { db, seoGeneratorSettingsTable, type SeoGeneratorSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getOpenAIClient } from "./openaiClient";
import { getGeminiClient } from "./geminiClient";
import { getMonthlyUsageStatus } from "./seoGenerator/usageLimits";

export type CheckSeverity = "ok" | "warning" | "error";

export interface AiHealthCheck {
  key: string;
  label: string;
  severity: CheckSeverity;
  message: string;
}

export interface AiHealthStatus {
  status: "healthy" | "warning" | "error";
  checks: AiHealthCheck[];
  checkedAt: string;
}

async function readSettings(): Promise<SeoGeneratorSettings> {
  const [row] = await db.select().from(seoGeneratorSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(seoGeneratorSettingsTable).values({}).returning();
  return created;
}

async function pingOpenAI(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getOpenAIClient();
    await client.models.list();
    return { ok: true, message: "OpenAI accepted the key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}

async function pingGemini(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getGeminiClient();
    await client.models.list();
    return { ok: true, message: "Gemini accepted the key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Gemini." };
  }
}

/**
 * Aggregate health for the AI Configuration Centre: per-provider
 * enabled/key/connectivity, plus whether at least one usable provider
 * remains (the actual thing that determines whether generation works at
 * all) and current usage against the monthly cap.
 */
export async function getAiHealth(): Promise<AiHealthStatus> {
  const settings = await readSettings();
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const checks: AiHealthCheck[] = [];

  checks.push({
    key: "openai",
    label: "OpenAI",
    severity: !settings.openaiEnabled ? "warning" : hasOpenAiKey ? "ok" : "error",
    message: !settings.openaiEnabled
      ? "Disabled by the admin."
      : hasOpenAiKey
        ? "Enabled with a key configured."
        : "Enabled but no OPENAI_API_KEY is configured.",
  });

  checks.push({
    key: "gemini",
    label: "Gemini",
    severity: !settings.geminiEnabled ? "warning" : hasGeminiKey ? "ok" : "error",
    message: !settings.geminiEnabled
      ? "Disabled by the admin."
      : hasGeminiKey
        ? "Enabled with a key configured."
        : "Enabled but no GEMINI_API_KEY is configured.",
  });

  const openaiUsable = settings.openaiEnabled && hasOpenAiKey;
  const geminiUsable = settings.geminiEnabled && hasGeminiKey;
  checks.push({
    key: "availability",
    label: "Generation availability",
    severity: openaiUsable || geminiUsable ? "ok" : "error",
    message:
      openaiUsable || geminiUsable
        ? `At least one provider is usable (${[openaiUsable && "OpenAI", geminiUsable && "Gemini"].filter(Boolean).join(", ")}).`
        : "No usable provider — generation will fail until a provider is both enabled and has a valid API key.",
  });

  if (openaiUsable) {
    const result = await pingOpenAI();
    checks.push({ key: "openai_connectivity", label: "OpenAI connectivity", severity: result.ok ? "ok" : "error", message: result.message });
  }
  if (geminiUsable) {
    const result = await pingGemini();
    checks.push({ key: "gemini_connectivity", label: "Gemini connectivity", severity: result.ok ? "ok" : "error", message: result.message });
  }

  try {
    const usage = await getMonthlyUsageStatus(settings);
    const pct = Math.round((usage.monthCount / Math.max(1, settings.monthlyGenerationLimit)) * 100);
    checks.push({
      key: "usage",
      label: "Monthly usage",
      severity: usage.monthCount >= settings.monthlyGenerationLimit ? "error" : pct >= settings.warningThresholdPercent ? "warning" : "ok",
      message: `${usage.monthCount} / ${settings.monthlyGenerationLimit} generations this month (${pct}%).`,
    });
  } catch {
    // Usage lookup is a nice-to-have on this dashboard, not load-bearing for
    // the overall health rollup -- skip silently if it fails.
  }

  const status: AiHealthStatus["status"] = checks.some((c) => c.severity === "error")
    ? "error"
    : checks.some((c) => c.severity === "warning")
      ? "warning"
      : "healthy";

  return { status, checks, checkedAt: new Date().toISOString() };
}
