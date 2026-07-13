import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily-instantiated OpenAI client using the user-supplied OPENAI_API_KEY
 * secret. Never sent to the browser; only used server-side by the AI SEO
 * article generator.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Ask an administrator to add it before using the AI SEO Article Generator.",
    );
  }
  client = new OpenAI({ apiKey });
  return client;
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
