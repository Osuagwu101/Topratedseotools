import { logger } from "../logger";

/**
 * Free, unofficial Google Autocomplete suggestion endpoint. Widely used for
 * keyword research tools, requires no API key, and is a lightweight JSON
 * lookup (not scraping a search results page), so it carries far less
 * risk/ToS exposure than scraping google.com/search directly.
 */
export async function fetchAutocompleteSuggestions(keyword: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    const suggestions = Array.isArray(data?.[1]) ? data[1] : [];
    return suggestions.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 10);
  } catch (err) {
    logger.warn({ err }, "Autocomplete lookup failed; continuing without it");
    return [];
  }
}
