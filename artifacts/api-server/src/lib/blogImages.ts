import sharp from "sharp";
import { randomUUID } from "crypto";
import { putPublicObject } from "./storage";
import { cleanFilename } from "./slugify";
import { db, blogSettingsTable } from "@workspace/db";

export type BlogImageKind = "featured" | "content" | "thumbnail" | "avatar";

// Practical max widths per usage; never upscale smaller originals.
const KIND_MAX_WIDTH: Record<BlogImageKind, number> = {
  featured: 1600,
  content: 1400,
  thumbnail: 800,
  avatar: 300,
};

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_BLOG_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface ProcessedBlogImage {
  url: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  mimeType: string;
  originalFilename: string;
}

async function getBlogImageSettings() {
  const [row] = await db.select().from(blogSettingsTable).limit(1);
  return {
    format: (row?.imageOutputFormat as "webp" | "avif") || "webp",
    quality: row?.imageQuality ?? 82,
    maxWidth: row?.maxImageWidth ?? 1600,
  };
}

/**
 * Validates, auto-orients, strips metadata, resizes (without upscaling),
 * compresses and converts an uploaded blog image, then stores it in the
 * public object storage bucket. Used for featured images, in-article images,
 * thumbnails and author avatars.
 */
export async function processAndStoreBlogImage(
  buffer: Buffer,
  originalFilename: string,
  kind: BlogImageKind,
): Promise<ProcessedBlogImage> {
  let metadata: import("sharp").Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new Error("This file could not be read as an image. It may be corrupted or an unsupported type.");
  }
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not determine image dimensions.");
  }

  const settings = await getBlogImageSettings();
  const kindMaxWidth = KIND_MAX_WIDTH[kind];
  const targetWidth = Math.min(kindMaxWidth, settings.maxWidth, metadata.width);

  let pipeline = sharp(buffer).rotate(); // auto-orient from EXIF, then strip metadata by re-encoding
  if (targetWidth < metadata.width) {
    pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
  }

  const format = settings.format === "avif" ? "avif" : "webp";
  const processed =
    format === "avif"
      ? await pipeline.avif({ quality: settings.quality }).toBuffer()
      : await pipeline.webp({ quality: settings.quality }).toBuffer();

  const finalMeta = await sharp(processed).metadata();
  const cleanName = cleanFilename(originalFilename).replace(/\.[a-z0-9]+$/i, "");
  const relativePath = `blog-media/${kind}/${cleanName}-${randomUUID().slice(0, 8)}.${format}`;

  const url = await putPublicObject(relativePath, processed, {
    contentType: `image/${format}`,
    cacheControl: "public, max-age=31536000, immutable",
  });

  return {
    url,
    width: finalMeta.width ?? targetWidth,
    height: finalMeta.height ?? 0,
    fileSizeBytes: processed.length,
    mimeType: `image/${format}`,
    originalFilename,
  };
}
