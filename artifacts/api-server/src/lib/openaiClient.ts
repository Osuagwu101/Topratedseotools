import OpenAI from "openai";

/**
 * Constructs an OpenAI client using the user-supplied OPENAI_API_KEY secret.
 * Never sent to the browser; only used server-side by the AI SEO article
 * generator. Deliberately not cached across calls: an administrator can
 * rotate this key from the System Configuration Centre while the server is
 * running (see lib/systemConfig.ts), which mirrors the change into
 * process.env immediately, and constructing the SDK client is cheap (no
 * network call), so re-reading it live is cheap and always correct.
 */
export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Ask an administrator to add it before using the AI SEO Article Generator.",
    );
  }
  return new OpenAI({ apiKey });
}

/** Allowed models an administrator can select in provider settings. */
export const ALLOWED_AI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"] as const;
export type AllowedAiModel = (typeof ALLOWED_AI_MODELS)[number];

/**
 * Calls the Chat Completions API and returns the parsed JSON object from the
 * response. Throws with a clear message on non-JSON or empty responses.
 */
export async function callJsonModel<T = unknown>(params: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: params.model,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.7,
    response_format: { type: "json_object" },
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("The AI model returned an empty response.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The AI model returned a response that could not be parsed as JSON.");
  }
}
