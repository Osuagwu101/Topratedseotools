import { GoogleGenAI } from "@google/genai";

/**
 * Constructs a Gemini client using the user-supplied GEMINI_API_KEY secret
 * (their own Google AI Studio key, not the Replit AI proxy). Never sent to
 * the browser; only used server-side by the AI SEO article generator as a
 * free-tier alternative to OpenAI. Deliberately not cached across calls: an
 * administrator can rotate this key from the System Configuration Centre
 * while the server is running (see lib/systemConfig.ts), which mirrors the
 * change into process.env immediately, and constructing the SDK client is
 * cheap (no network call), so re-reading it live is cheap and always correct.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Ask an administrator to add it before generating with Gemini.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Allowed Gemini models an administrator can select in provider settings.
 * Uses the "-latest" aliases rather than dated snapshots (e.g. "gemini-2.5-flash")
 * because Google retires dated model IDs for new API keys/projects fairly
 * quickly; the aliases stay valid as Google rolls the underlying model forward.
 */
export const ALLOWED_GEMINI_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-pro-latest"] as const;
export type AllowedGeminiModel = (typeof ALLOWED_GEMINI_MODELS)[number];

/**
 * Calls Gemini's generateContent with JSON response mode and returns the
 * parsed JSON object. Mirrors callJsonModel() in openaiClient.ts so callers
 * can treat both providers uniformly.
 */
export async function callGeminiJsonModel<T = unknown>(params: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: params.model,
    contents: [{ role: "user", parts: [{ text: params.user }] }],
    config: {
      systemInstruction: params.system,
      temperature: params.temperature ?? 0.7,
      maxOutputTokens: params.maxTokens ?? 8192,
      responseMimeType: "application/json",
    },
  });
  const text = response.text;
  if (!text) throw new Error("The AI model returned an empty response.");
  return parseJsonLeniently<T>(text);
}

/**
 * Gemini's JSON response mode occasionally emits output missing its final
 * closing brace/bracket (observed even with finishReason "STOP", not just on
 * MAX_TOKENS truncation) and sometimes wraps JSON in markdown code fences
 * despite responseMimeType being set. Strip fences, then fall back to
 * balancing unclosed braces/brackets before giving up.
 */
function parseJsonLeniently<T>(raw: string): T {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // fall through to repair attempt
  }

  // Gemini's JSON response mode occasionally emits either trailing garbage
  // after the JSON value closes (e.g. a stray extra "}"), or truncates
  // mid-value despite reporting finishReason "STOP". Scan from the first
  // "{" tracking string/escape state and bracket depth: if depth returns to
  // zero, take exactly that substring (drops trailing garbage); if we run
  // out of input first, close the still-open brackets/strings (drops
  // nothing, just completes the truncated value).
  const start = stripped.indexOf("{");
  if (start === -1) {
    console.error("[geminiClient] unparsable JSON, no opening brace, length=%d", stripped.length);
    throw new Error("The AI model returned a response that could not be parsed as JSON.");
  }

  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  let endIndex = -1;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") {
      closers.pop();
      if (closers.length === 0) {
        endIndex = i;
        break;
      }
    }
  }

  const candidates: string[] = [];
  if (endIndex !== -1) {
    candidates.push(stripped.slice(start, endIndex + 1));
  } else {
    // Never closed: truncated mid-value. Close the open string (if any) then
    // append closers for every still-open brace/bracket, innermost first.
    let repaired = stripped.slice(start);
    if (inString) repaired += '"';
    repaired += closers.reverse().join("");
    candidates.push(repaired);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate, if any
    }
  }
  console.error("[geminiClient] unparsable JSON, length=%d, tail=%s", stripped.length, JSON.stringify(stripped.slice(-300)));
  throw new Error("The AI model returned a response that could not be parsed as JSON.");
}
