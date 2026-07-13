import { scanForBannedPhrases } from "./bannedPhrases";

export function plainTextWordCount(html: string): number {
  const text = html.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(" ").filter(Boolean).length;
}

export function plainText(html: string): string {
  return html.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
}

/** Rough sentence-length variation heuristic: standard deviation of sentence word counts. */
export function sentenceLengthVariation(html: string): { avg: number; stdDev: number; sentenceCount: number } {
  const text = plainText(html);
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const lengths = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  if (lengths.length === 0) return { avg: 0, stdDev: 0, sentenceCount: 0 };
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - avg) ** 2, 0) / lengths.length;
  return { avg, stdDev: Math.sqrt(variance), sentenceCount: lengths.length };
}

export interface KeywordPlacementCheck {
  inTitle: boolean;
  inFirstParagraph: boolean;
  inAtLeastOneH2: boolean;
  inMetaDescription: boolean;
  keywordDensityPercent: number;
  score: number; // 0-100
}

export function checkKeywordPlacement(params: {
  fullContentHtml: string;
  title: string;
  metaDescription: string;
  primaryKeyword: string;
}): KeywordPlacementCheck {
  const kw = params.primaryKeyword.trim().toLowerCase();
  if (!kw) {
    return {
      inTitle: false,
      inFirstParagraph: false,
      inAtLeastOneH2: false,
      inMetaDescription: false,
      keywordDensityPercent: 0,
      score: 0,
    };
  }

  const inTitle = params.title.toLowerCase().includes(kw);
  const inMetaDescription = params.metaDescription.toLowerCase().includes(kw);

  const firstParagraphMatch = params.fullContentHtml.match(/<p[^>]*>(.*?)<\/p>/is);
  const firstParagraphText = firstParagraphMatch ? plainText(firstParagraphMatch[1]).toLowerCase() : "";
  const inFirstParagraph = firstParagraphText.includes(kw);

  const h2Matches = [...params.fullContentHtml.matchAll(/<h2[^>]*>(.*?)<\/h2>/gis)];
  const inAtLeastOneH2 = h2Matches.some((m) => plainText(m[1]).toLowerCase().includes(kw));

  const bodyText = plainText(params.fullContentHtml).toLowerCase();
  const bodyWordCount = bodyText.split(" ").filter(Boolean).length;
  const kwWordCount = kw.split(" ").length;
  const occurrences = bodyText.split(kw).length - 1;
  const keywordDensityPercent = bodyWordCount > 0 ? ((occurrences * kwWordCount) / bodyWordCount) * 100 : 0;

  let score = 0;
  if (inTitle) score += 25;
  if (inFirstParagraph) score += 25;
  if (inAtLeastOneH2) score += 25;
  if (inMetaDescription) score += 15;
  if (keywordDensityPercent > 0.4 && keywordDensityPercent < 2.5) score += 10;

  return { inTitle, inFirstParagraph, inAtLeastOneH2, inMetaDescription, keywordDensityPercent, score };
}

export interface StructuralValidation {
  introWordCount: number;
  introInRange: boolean;
  conclusionWordCount: number;
  conclusionInRange: boolean;
  featuredSnippetLength: number;
  featuredSnippetInRange: boolean;
  bannedPhraseHits: string[];
  sentenceVariation: { avg: number; stdDev: number; sentenceCount: number };
}

export async function validateArticleStructure(params: {
  introHtml: string;
  conclusionHtml: string;
  featuredSnippet: string;
  bodyHtml: string;
  bannedPhrases: string[];
}): Promise<StructuralValidation> {
  const introWordCount = plainTextWordCount(params.introHtml);
  const conclusionWordCount = plainTextWordCount(params.conclusionHtml);
  const featuredSnippetLength = params.featuredSnippet.trim().length;

  const combinedText = [params.introHtml, params.bodyHtml, params.conclusionHtml, params.featuredSnippet].join(" ");
  const bannedPhraseHits = scanForBannedPhrases(combinedText, params.bannedPhrases);

  return {
    introWordCount,
    introInRange: introWordCount >= 90 && introWordCount <= 110,
    conclusionWordCount,
    conclusionInRange: conclusionWordCount >= 90 && conclusionWordCount <= 110,
    featuredSnippetLength,
    featuredSnippetInRange: featuredSnippetLength >= 150 && featuredSnippetLength <= 300,
    bannedPhraseHits,
    sentenceVariation: sentenceLengthVariation(params.bodyHtml),
  };
}
