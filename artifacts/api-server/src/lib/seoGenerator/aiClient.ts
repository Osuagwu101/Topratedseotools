import { callJsonModel, ALLOWED_AI_MODELS } from "../openaiClient";
import { callGeminiJsonModel, ALLOWED_GEMINI_MODELS } from "../geminiClient";
import { logger } from "../logger";

export const AI_PROVIDERS = ["openai", "gemini"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-flash-latest",
};

/** Returns a valid model for the given provider, falling back to its default if the supplied one isn't allowed. */
export function resolveModel(provider: AiProvider, model?: string | null): string {
  if (provider === "openai") {
    return model && (ALLOWED_AI_MODELS as readonly string[]).includes(model) ? model : DEFAULT_MODEL_BY_PROVIDER.openai;
  }
  return model && (ALLOWED_GEMINI_MODELS as readonly string[]).includes(model) ? model : DEFAULT_MODEL_BY_PROVIDER.gemini;
}

export function isValidProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Provider-agnostic JSON generation call. Every AI SEO Article Generator
 * prompt goes through here so callers (and error handling, usage logging)
 * don't need to branch on provider.
 */
export async function generateJson<T = unknown>(params: {
  provider: AiProvider;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  if (params.provider === "gemini") {
    return callGeminiJsonModel<T>(params);
  }
  return callJsonModel<T>(params);
}

/** True for errors that mean "this provider/model is temporarily out of capacity" (billing quota, free-tier daily/per-minute cap, 429 rate limit) — as opposed to a real bug (bad prompt, malformed JSON, missing API key) that would fail again identically on retry. */
function isQuotaOrRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number; code?: number | string })?.status;
  return status === 429 || /RESOURCE_EXHAUSTED/i.test(message) || /rate.?limit/i.test(message) || /exceeded your current quota/i.test(message);
}

/**
 * Fallback order to try when the requested provider/model is out of quota:
 * other models on the same provider first (Gemini gives each model its own
 * independent free-tier daily cap, so a sibling model often still has
 * headroom), then the other provider's default model if it's configured.
 * Only providers/models with a configured API key are attempted.
 */
function buildFallbackChain(provider: AiProvider, model: string): { provider: AiProvider; model: string }[] {
  const chain: { provider: AiProvider; model: string }[] = [];
  if (provider === "gemini") {
    if (process.env.GEMINI_API_KEY) {
      for (const m of ALLOWED_GEMINI_MODELS) {
        if (m !== model) chain.push({ provider: "gemini", model: m });
      }
    }
    if (process.env.OPENAI_API_KEY) chain.push({ provider: "openai", model: DEFAULT_MODEL_BY_PROVIDER.openai });
  } else {
    if (process.env.GEMINI_API_KEY) chain.push({ provider: "gemini", model: DEFAULT_MODEL_BY_PROVIDER.gemini });
    if (process.env.OPENAI_API_KEY) {
      for (const m of ALLOWED_AI_MODELS) {
        if (m !== model) chain.push({ provider: "openai", model: m });
      }
    }
  }
  return chain;
}

export interface GenerateJsonResult<T> {
  data: T;
  provider: AiProvider;
  model: string;
  /** Present when the originally requested provider/model was out of quota and a fallback had to be used instead — callers can surface this to the editor and record it in usage logs. */
  fallbackFrom?: { provider: AiProvider; model: string; reason: string };
}

/**
 * Provider/model-aware JSON generation with automatic fallback. Every AI SEO
 * Article Generator call site should go through this (not the raw
 * `generateJson`) so that a single exhausted free-tier quota or billing
 * lapse on one provider/model doesn't block generation entirely in
 * production — it transparently retries down a fallback chain instead.
 * Non-quota errors (bad prompt, unparsable JSON, missing key) are not
 * retried and propagate immediately, since retrying would just fail the
 * same way.
 */
export async function generateJsonWithFallback<T = unknown>(params: {
  provider: AiProvider;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<GenerateJsonResult<T>> {
  const { provider, model, ...rest } = params;
  const attempts = [{ provider, model }, ...buildFallbackChain(provider, model)];
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const data = await generateJson<T>({ ...rest, provider: attempt.provider, model: attempt.model });
      if (i === 0) return { data, provider: attempt.provider, model: attempt.model };
      logger.warn(
        { requested: { provider, model }, used: attempt, reason: lastErr instanceof Error ? lastErr.message : String(lastErr) },
        "AI SEO generator fell back to a different provider/model after a quota/rate-limit error",
      );
      return {
        data,
        provider: attempt.provider,
        model: attempt.model,
        fallbackFrom: { provider, model, reason: lastErr instanceof Error ? lastErr.message : String(lastErr) },
      };
    } catch (err) {
      lastErr = err;
      if (!isQuotaOrRateLimitError(err)) throw err;
      // quota/rate-limit error: fall through and try the next attempt in the chain
    }
  }
  throw new Error(
    `AI generation is temporarily unavailable: every configured provider/model is out of quota or rate-limited. Last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
