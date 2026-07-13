import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

// ── Provider / limits settings (singleton row, admin-configurable) ──────────
export const seoGeneratorSettingsTable = pgTable("seo_generator_settings", {
  id: serial("id").primaryKey(),
  aiModel: text("ai_model").notNull().default("gpt-4o-mini"),
  // Optional SERP data provider for PAA / related searches / competitor analysis.
  // Null/empty means those features are disabled; autocomplete + generation
  // still work without it. Key is stored server-side only and never returned
  // to the browser — the settings API exposes only a boolean "hasSerpApiKey".
  serpProvider: text("serp_provider"), // "serpapi" | "searchapi" | null
  serpApiKey: text("serp_api_key"),
  cacheDurationMinutes: integer("cache_duration_minutes").notNull().default(1440),
  perUserDailyLimit: integer("per_user_daily_limit").notNull().default(10),
  monthlyGenerationLimit: integer("monthly_generation_limit").notNull().default(200),
  confirmBeforeExpensiveOps: boolean("confirm_before_expensive_ops").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by"),
});

export const keywordResearchSessionStatuses = ["collecting", "ready"] as const;
export type KeywordResearchSessionStatus = (typeof keywordResearchSessionStatuses)[number];
export const searchIntents = ["informational", "commercial", "transactional", "navigational"] as const;
export type SearchIntent = (typeof searchIntents)[number];

export const keywordResearchSessionsTable = pgTable("keyword_research_sessions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  primaryKeyword: text("primary_keyword").notNull(),
  searchIntent: text("search_intent"), // SearchIntent, set once classified
  recommendedWordCount: integer("recommended_word_count"),
  status: text("status").notNull().default("collecting"), // KeywordResearchSessionStatus
  serpDataAvailable: boolean("serp_data_available").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const keywordResearchItemKinds = [
  "autocomplete",
  "related_keyword",
  "paa",
  "related_search",
  "competitor",
] as const;
export type KeywordResearchItemKind = (typeof keywordResearchItemKinds)[number];

export const keywordResearchItemsTable = pgTable("keyword_research_items", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  kind: text("kind").notNull(), // KeywordResearchItemKind
  value: text("value").notNull(), // keyword / question / competitor URL
  // Extra structured data, e.g. { wordCount, position } for competitors.
  extra: jsonb("extra"),
  included: boolean("included").notNull().default(true),
  editedByUser: boolean("edited_by_user").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contentBriefsTable = pgTable("content_briefs", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().unique(),
  sessionId: integer("session_id").notNull(),
  searchIntent: text("search_intent").notNull().default("informational"),
  targetWordCount: integer("target_word_count").notNull().default(1200),
  // Array of { level: 2|3, text: string }
  headingOutline: jsonb("heading_outline").notNull().default([]),
  // Array of { question: string, answer?: string }
  faqCandidates: jsonb("faq_candidates").notNull().default([]),
  featuredSnippetTarget: text("featured_snippet_target"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const generationJobTypes = ["full_article", "section"] as const;
export type GenerationJobType = (typeof generationJobTypes)[number];
export const generationJobStatuses = ["pending", "running", "succeeded", "failed"] as const;
export type GenerationJobStatus = (typeof generationJobStatuses)[number];
export const sectionKeys = ["intro", "body", "conclusion", "faq", "featured_snippet", "full"] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const generationJobsTable = pgTable("generation_jobs", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  sessionId: integer("session_id"),
  jobType: text("job_type").notNull(), // GenerationJobType
  sectionKey: text("section_key"), // SectionKey, set when jobType = "section"
  status: text("status").notNull().default("pending"), // GenerationJobStatus
  model: text("model").notNull(),
  errorMessage: text("error_message"),
  // Validation summary produced right after generation (word counts, keyword
  // placement, banned-phrase hits) so the UI can show it without recomputation.
  resultSummary: jsonb("result_summary"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const postSectionVersionsTable = pgTable("post_section_versions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  sectionKey: text("section_key").notNull(), // SectionKey
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(), // sanitized HTML fragment for this section
  isActive: boolean("is_active").notNull().default(true),
  jobId: integer("job_id"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const seoQualityReportsTable = pgTable("seo_quality_reports", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  jobId: integer("job_id"),
  keywordPlacementScore: integer("keyword_placement_score").notNull().default(0),
  readabilityScore: integer("readability_score").notNull().default(0),
  lengthCheckPassed: boolean("length_check_passed").notNull().default(false),
  introWordCount: integer("intro_word_count"),
  conclusionWordCount: integer("conclusion_word_count"),
  featuredSnippetLength: integer("featured_snippet_length"),
  bannedPhraseHits: jsonb("banned_phrase_hits").notNull().default([]),
  flaggedClaims: jsonb("flagged_claims").notNull().default([]),
  reportJson: jsonb("report_json").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bannedPhrasesTable = pgTable("banned_phrases", {
  id: serial("id").primaryKey(),
  phrase: text("phrase").notNull().unique(),
  category: text("category").notNull().default("ai_cliche"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const generationUsageLogActions = [
  "research",
  "brief",
  "generate_full",
  "generate_section",
  "regenerate_section",
] as const;
export type GenerationUsageLogAction = (typeof generationUsageLogActions)[number];

export const generationUsageLogTable = pgTable("generation_usage_log", {
  id: serial("id").primaryKey(),
  staffUserId: integer("staff_user_id").notNull(),
  postId: integer("post_id"),
  action: text("action").notNull(), // GenerationUsageLogAction
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SeoGeneratorSettings = typeof seoGeneratorSettingsTable.$inferSelect;
export type KeywordResearchSession = typeof keywordResearchSessionsTable.$inferSelect;
export type KeywordResearchItem = typeof keywordResearchItemsTable.$inferSelect;
export type ContentBrief = typeof contentBriefsTable.$inferSelect;
export type GenerationJob = typeof generationJobsTable.$inferSelect;
export type PostSectionVersion = typeof postSectionVersionsTable.$inferSelect;
export type SeoQualityReport = typeof seoQualityReportsTable.$inferSelect;
export type BannedPhrase = typeof bannedPhrasesTable.$inferSelect;
export type GenerationUsageLog = typeof generationUsageLogTable.$inferSelect;
