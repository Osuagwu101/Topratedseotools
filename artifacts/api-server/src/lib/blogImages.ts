import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage";
import { cleanFilename } from "./slugify";
import { db, blogSettingsTable } from "@workspace/db";

function firstPublicSearchPath(): string {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = pathsStr.split(",").map((p) => p.trim()).filter(Boolean)[0];
  if (!first) {
    throw new Error(
      "PUBLIC_OBJECT_SEARCH_PATHS not set. Object storage must be provisioned before uploading blog images.",
    );
  }
  return first;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object storage path: must contain at least a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

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
  const fullPath = `${firstPublicSearchPath()}/${relativePath}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(processed, {
    contentType: `image/${format}`,
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });

  return {
    url: `/api/storage/public-objects/${relativePath}`,
    width: finalMeta.width ?? targetWidth,
    height: finalMeta.height ?? 0,
    fileSizeBytes: processed.length,
    mimeType: `image/${format}`,
    originalFilename,
  };
}
