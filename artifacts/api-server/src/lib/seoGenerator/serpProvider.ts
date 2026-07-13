import { logger } from "../logger";
import type { SeoGeneratorSettings } from "@workspace/db";

export interface SerpCompetitor {
  url: string;
  title?: string;
  wordCount?: number;
}

export interface SerpData {
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  competitors: SerpCompetitor[];
  recommendedWordCount: number | null;
}

const EMPTY_SERP_DATA: SerpData = {
  peopleAlsoAsk: [],
  relatedSearches: [],
  competitors: [],
  recommendedWordCount: null,
};

/**
 * Optional SERP data provider (SerpApi or SearchAPI.io). Both offer a free
 * monthly tier. Direct scraping of Google's result pages is intentionally
 * NOT implemented — it violates Google's Terms of Service and is unreliable
 * (IP blocks). When no provider key is configured, callers should treat
 * PAA/related-searches/competitor-analysis as simply unavailable, not fall
 * back to scraping.
 */
export async function fetchSerpData(
  keyword: string,
  settings: SeoGeneratorSettings,
): Promise<SerpData> {
  if (!settings.serpProvider || !settings.serpApiKey) {
    return EMPTY_SERP_DATA;
  }

  try {
    if (settings.serpProvider === "serpapi") {
      return await fetchFromSerpApi(keyword, settings.serpApiKey);
    }
    if (settings.serpProvider === "searchapi") {
      return await fetchFromSearchApiIo(keyword, settings.serpApiKey);
    }
    return EMPTY_SERP_DATA;
  } catch (err) {
    logger.warn({ err, provider: settings.serpProvider }, "SERP provider lookup failed");
    return EMPTY_SERP_DATA;
  }
}

async function fetchFromSerpApi(keyword: string, apiKey: string): Promise<SerpData> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(keyword)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SerpApi request failed with status ${res.status}`);
  const data = (await res.json()) as any;
  const peopleAlsoAsk: string[] = Array.isArray(data.related_questions)
    ? data.related_questions.map((q: any) => q.question).filter(Boolean).slice(0, 8)
    : [];
  const relatedSearches: string[] = Array.isArray(data.related_searches)
    ? data.related_searches.map((r: any) => r.query).filter(Boolean).slice(0, 8)
    : [];
  const organic = Array.isArray(data.organic_results) ? data.organic_results.slice(0, 5) : [];
  const competitors: SerpCompetitor[] = organic.map((r: any) => ({
    url: r.link,
    title: r.title,
  }));
  return { peopleAlsoAsk, relatedSearches, competitors, recommendedWordCount: null };
}

async function fetchFromSearchApiIo(keyword: string, apiKey: string): Promise<SerpData> {
  const url = `https://www.searchapi.io/api/v1/search?engine=google&q=${encodeURIComponent(keyword)}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SearchAPI.io request failed with status ${res.status}`);
  const data = (await res.json()) as any;
  const peopleAlsoAsk: string[] = Array.isArray(data.related_questions)
    ? data.related_questions.map((q: any) => q.question).filter(Boolean).slice(0, 8)
    : [];
  const relatedSearches: string[] = Array.isArray(data.related_searches)
    ? data.related_searches.map((r: any) => r.query).filter(Boolean).slice(0, 8)
    : [];
  const organic = Array.isArray(data.organic_results) ? data.organic_results.slice(0, 5) : [];
  const competitors: SerpCompetitor[] = organic.map((r: any) => ({
    url: r.link,
    title: r.title,
  }));
  return { peopleAlsoAsk, relatedSearches, competitors, recommendedWordCount: null };
}

/**
 * Best-effort competitor word count estimate: fetches each competitor page's
 * HTML and counts visible text. Failures for individual pages are ignored —
 * this is a helpful signal, not a hard requirement.
 */
export async function estimateCompetitorWordCounts(competitors: SerpCompetitor[]): Promise<SerpCompetitor[]> {
  const results = await Promise.all(
    competitors.slice(0, 5).map(async (c) => {
      try {
        const res = await fetch(c.url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return c;
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const wordCount = text.split(" ").filter(Boolean).length;
        return { ...c, wordCount };
      } catch {
        return c;
      }
    }),
  );
  return results;
}
