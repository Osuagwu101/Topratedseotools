export interface Category {
  id: string | number;
  name: string;
  slug: string;
  description: string;
}

export interface Tag {
  id: string | number;
  name: string;
  slug: string;
}

export interface Author {
  id: string | number;
  name: string;
  authorSlug: string;
  bio: string;
  avatarUrl: string;
}

export interface Post {
  id: string | number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  featuredImageCaption: string;
  status: string;
  isFeatured: boolean;
  allowComments: boolean;
  noIndex: boolean;
  noFollow: boolean;
  readingTimeMinutes: number;
  viewCount: number;
  publishedAt: string;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  focusKeyword: string;
  author: Author | null;
  category: Category | null;
  tags: Tag[];
}

export interface Comment {
  id: string | number;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
}

export interface CTA {
  name: string;
  description: string;
  priceKobo?: number;
  productId?: number;
  ctaCustomLabel?: string;
  ctaCustomUrl?: string;
}