// Prompt builders for the AI SEO Article Generator. All prompts request
// strict JSON output (response_format: json_object) so the API layer can
// validate and store structured results instead of parsing prose.

const NIGERIAN_VOICE_GUIDANCE = `Write in a natural, human Nigerian English voice for a Nigerian and pan-African audience:
- Use vocabulary and phrasing familiar to Nigerian readers (e.g. natural, everyday word choices), without exaggerated slang.
- Vary sentence length deliberately: mix short punchy sentences with longer explanatory ones. Never produce a string of same-length sentences.
- Sound like a knowledgeable person explaining something to a colleague, not like a corporate blog template.
- NEVER use generic AI-writing clichés such as "unlock the power of", "in today's fast-paced world", "delve into", "navigate the landscape", "game-changer", "seamless", "robust solution", "unparalleled", "in conclusion,", "let's dive in", "it's worth noting that", or similar stock phrases.
- Do not invent statistics, study results, percentages, or named sources. If you reference a fact that would normally need a citation, phrase it generally (e.g. "many users report...") instead of inventing a specific number or study.`;

export function buildIntentAndBriefPrompt(params: {
  primaryKeyword: string;
  autocomplete: string[];
  relatedKeywords: string[];
  peopleAlsoAsk: string[];
  relatedSearches: string[];
  competitorWordCounts: number[];
}): { system: string; user: string } {
  const system = `You are an SEO content strategist. Analyze keyword research data and produce a structured content brief as JSON. Respond ONLY with a JSON object matching this shape:
{
  "searchIntent": "informational" | "commercial" | "transactional" | "navigational",
  "targetWordCount": number,
  "headingOutline": [{ "level": 2 | 3, "text": string }],
  "faqCandidates": [{ "question": string }],
  "featuredSnippetTarget": string,
  "notes": string
}
"featuredSnippetTarget" must be a single sentence describing what the featured-snippet answer box should directly answer.
Base "targetWordCount" on the competitor word counts provided when available (aim slightly above their average); otherwise use a sensible default for the topic (900-1800).`;

  const user = `Primary keyword: "${params.primaryKeyword}"
Autocomplete suggestions: ${JSON.stringify(params.autocomplete)}
Related/semantic keywords: ${JSON.stringify(params.relatedKeywords)}
People Also Ask questions: ${JSON.stringify(params.peopleAlsoAsk)}
Related searches: ${JSON.stringify(params.relatedSearches)}
Competitor word counts (top-ranking pages, if available): ${JSON.stringify(params.competitorWordCounts)}

Produce the content brief JSON now.`;

  return { system, user };
}

export function buildRelatedKeywordsPrompt(primaryKeyword: string): { system: string; user: string } {
  const system = `You are a keyword research assistant. Given a primary keyword, produce 8-12 closely related / semantically relevant keywords a search engine would associate with the topic (LSI-style, not just minor variations). Respond ONLY with JSON: { "relatedKeywords": string[] }`;
  const user = `Primary keyword: "${primaryKeyword}"`;
  return { system, user };
}

export function buildFullArticlePrompt(params: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  targetWordCount: number;
  headingOutline: { level: number; text: string }[];
  faqCandidates: { question: string }[];
  featuredSnippetTarget: string;
}): { system: string; user: string } {
  const system = `You are an expert SEO content writer producing a complete blog article. ${NIGERIAN_VOICE_GUIDANCE}

Structural rules (must all be followed exactly):
1. The intro paragraph(s) must total between 90 and 110 words.
2. The conclusion paragraph(s) must total between 90 and 110 words.
3. Include a single "featured snippet answer" — one direct answer, 150 to 300 characters, that could stand alone as a Google featured snippet for the primary keyword.
4. The primary keyword must appear naturally in: the article title, the first paragraph, at least one H2 heading, and the meta description. Do not keyword-stuff — keep it natural.
5. Use proper heading structure (H2 for main sections, H3 for subsections) following the provided outline as a guide (you may refine wording).
6. Include an FAQ section near the end answering the candidate questions provided (rephrase questions naturally, do not just copy them verbatim if awkward).
7. Body content must use clean HTML: <p>, <h2>, <h3>, <ul>/<li>, <strong> where useful. No inline styles, no <script>, no <html>/<body> wrapper tags.

Respond ONLY with a JSON object matching this shape:
{
  "title": string,
  "metaDescription": string,
  "featuredSnippet": string,
  "introHtml": string,
  "bodyHtml": string,
  "faqHtml": string,
  "conclusionHtml": string
}
"introHtml" and "conclusionHtml" must each be wrapped in <p> tags and contain ONLY the intro/conclusion paragraphs (not headings). "bodyHtml" contains everything between the intro and the FAQ section (all H2/H3 sections). "faqHtml" contains an <h2>FAQ</h2> or similar heading followed by question/answer pairs.`;

  const user = `Primary keyword: "${params.primaryKeyword}"
Secondary/related keywords to weave in naturally where relevant: ${JSON.stringify(params.secondaryKeywords)}
Search intent: ${params.searchIntent}
Target total word count (excluding FAQ): ${params.targetWordCount}
Heading outline to follow: ${JSON.stringify(params.headingOutline)}
FAQ questions to answer: ${JSON.stringify(params.faqCandidates.map((f) => f.question))}
Featured snippet should directly answer: ${params.featuredSnippetTarget}

Write the full article now as the JSON object described.`;

  return { system, user };
}

export function buildSectionRegenerationPrompt(params: {
  sectionKey: string;
  primaryKeyword: string;
  searchIntent: string;
  contextSummary: string;
  instructions?: string;
}): { system: string; user: string } {
  const sectionRules: Record<string, string> = {
    intro: "Produce ONLY the intro paragraph(s), wrapped in <p> tags, totalling between 90 and 110 words.",
    conclusion: "Produce ONLY the conclusion paragraph(s), wrapped in <p> tags, totalling between 90 and 110 words.",
    faq: "Produce ONLY the FAQ section HTML (heading + question/answer pairs).",
    featured_snippet: "Produce ONLY a single sentence/short paragraph of plain text, 150-300 characters, that directly answers the primary keyword query as a featured-snippet answer. Return plain text, no HTML.",
    body: "Produce ONLY the main body HTML sections (H2/H3 headings with paragraphs/lists), excluding the intro, conclusion, and FAQ.",
    full: "Produce the full article HTML.",
  };

  const system = `You are an expert SEO content writer regenerating one section of an existing article. ${NIGERIAN_VOICE_GUIDANCE}

${sectionRules[params.sectionKey] ?? sectionRules.body}

Respond ONLY with JSON: { "html": string }`;

  const user = `Primary keyword: "${params.primaryKeyword}"
Search intent: ${params.searchIntent}
Context / existing article summary: ${params.contextSummary}
${params.instructions ? `Additional instructions from the editor: ${params.instructions}` : ""}`;

  return { system, user };
}

export function buildClaimFlaggingPrompt(articleText: string): { system: string; user: string } {
  const system = `You are a fact-checking assistant. Scan the article text for any specific statistic, percentage, dollar/naira figure, study reference, or named source that reads as a concrete factual claim which would need a citation. Respond ONLY with JSON: { "flaggedClaims": string[] }. Each entry should be the exact sentence or phrase containing the claim. If there are none, return an empty array.`;
  const user = `Article text:\n${articleText.slice(0, 12000)}`;
  return { system, user };
}
