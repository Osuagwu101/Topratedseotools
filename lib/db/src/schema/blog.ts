import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const blogPostStatuses = ["draft", "in_review", "scheduled", "published", "archived"] as const;
export type BlogPostStatus = (typeof blogPostStatuses)[number];

export const blogCategoriesTable = pgTable("blog_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blogTagsTable = pgTable("blog_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogPostsTable = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  // Rich content stored as sanitized HTML produced by the CMS editor.
  content: text("content").notNull().default(""),
  featuredImageUrl: text("featured_image_url"),
  featuredImageAlt: text("featured_image_alt"),
  featuredImageCaption: text("featured_image_caption"),
  authorId: integer("author_id"),
  categoryId: integer("category_id"),
  status: text("status").notNull().default("draft"), // BlogPostStatus
  isFeatured: boolean("is_featured").notNull().default(false),
  allowComments: boolean("allow_comments").notNull().default(true),
  noIndex: boolean("no_index").notNull().default(false),
  readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: timestamp("published_at"),
  scheduledAt: timestamp("scheduled_at"),
  // Manual override for related posts; when empty, related posts are computed
  // from shared category/tags at read time.
  relatedPostIds: integer("related_post_ids").array().notNull().default([]),
  // Optional promotional CTA tied to a store product/plan.
  ctaProductId: integer("cta_product_id"),
  ctaCustomLabel: text("cta_custom_label"),
  ctaCustomUrl: text("cta_custom_url"),
  // SEO panel
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  focusKeyword: text("focus_keyword"),
  secondaryKeywords: text("secondary_keywords").array().notNull().default([]),
  canonicalUrl: text("canonical_url"),
  ogTitle: text("og_title"),
  ogDescription: text("og_description"),
  ogImageUrl: text("og_image_url"),
  noFollow: boolean("no_follow").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const blogPostTagsTable = pgTable("blog_post_tags", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  tagId: integer("tag_id").notNull(),
});

export const blogMediaTable = pgTable("blog_media", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  originalFilename: text("original_filename"),
  altText: text("alt_text"),
  caption: text("caption"),
  width: integer("width"),
  height: integer("height"),
  fileSizeBytes: integer("file_size_bytes"),
  mimeType: text("mime_type"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogRedirectsTable = pgTable("blog_redirects", {
  id: serial("id").primaryKey(),
  fromSlug: text("from_slug").notNull().unique(),
  toSlug: text("to_slug").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogCommentStatuses = ["pending", "approved", "spam", "rejected"] as const;
export type BlogCommentStatus = (typeof blogCommentStatuses)[number];

export const blogCommentsTable = pgTable("blog_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"), // BlogCommentStatus
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const newsletterSubscribersTable = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("blog"),
  confirmed: boolean("confirmed").notNull().default(true),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
});

export const blogSettingsTable = pgTable("blog_settings", {
  id: serial("id").primaryKey(),
  blogTitle: text("blog_title").notNull().default("Blog"),
  blogIntro: text("blog_intro").default(
    "Insights, guides and tips to help you get the most out of your favourite SEO tools.",
  ),
  postsPerPage: integer("posts_per_page").notNull().default(9),
  imageOutputFormat: text("image_output_format").notNull().default("webp"),
  imageQuality: integer("image_quality").notNull().default(82),
  maxImageWidth: integer("max_image_width").notNull().default(1600),
  autoFilenameCleaning: boolean("auto_filename_cleaning").notNull().default(true),
  autoAltTextSuggestion: boolean("auto_alt_text_suggestion").notNull().default(true),
  commentsEnabledGlobally: boolean("comments_enabled_globally").notNull().default(true),
  newsletterEnabled: boolean("newsletter_enabled").notNull().default(true),
  rssEnabled: boolean("rss_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBlogCategorySchema = createInsertSchema(blogCategoriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBlogTagSchema = createInsertSchema(blogTagsTable).omit({ id: true, createdAt: true });
export const insertBlogPostSchema = createInsertSchema(blogPostsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBlogCommentSchema = createInsertSchema(blogCommentsTable).omit({ id: true, createdAt: true });
export const insertNewsletterSubscriberSchema = createInsertSchema(newsletterSubscribersTable).omit({ id: true, subscribedAt: true });

export type InsertBlogCategory = z.infer<typeof insertBlogCategorySchema>;
export type BlogCategory = typeof blogCategoriesTable.$inferSelect;
export type InsertBlogTag = z.infer<typeof insertBlogTagSchema>;
export type BlogTag = typeof blogTagsTable.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPostsTable.$inferSelect;
export type BlogPostTag = typeof blogPostTagsTable.$inferSelect;
export type BlogMedia = typeof blogMediaTable.$inferSelect;
export type BlogRedirect = typeof blogRedirectsTable.$inferSelect;
export type InsertBlogComment = z.infer<typeof insertBlogCommentSchema>;
export type BlogComment = typeof blogCommentsTable.$inferSelect;
export type InsertNewsletterSubscriber = z.infer<typeof insertNewsletterSubscriberSchema>;
export type NewsletterSubscriber = typeof newsletterSubscribersTable.$inferSelect;
export type BlogSettings = typeof blogSettingsTable.$inferSelect;
