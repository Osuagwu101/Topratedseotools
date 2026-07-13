import { callJsonModel, ALLOWED_AI_MODELS } from "../openaiClient";
import { callGeminiJsonModel, ALLOWED_GEMINI_MODELS } from "../geminiClient";

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
