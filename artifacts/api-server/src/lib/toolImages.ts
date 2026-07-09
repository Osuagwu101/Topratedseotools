import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage";

// Standard square dimensions all tool logos are normalized to for a consistent
// storefront grid. Uploaded images are checked against this aspect ratio; a
// mismatch (beyond STANDARD_ASPECT_TOLERANCE) prompts the admin to confirm an
// automatic resize rather than silently distorting or rejecting the upload.
export const STANDARD_IMAGE_SIZE = 512;
const STANDARD_ASPECT_TOLERANCE = 0.05;

function firstPublicSearchPath(): string {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = pathsStr.split(",").map((p) => p.trim()).filter(Boolean)[0];
  if (!first) {
    throw new Error(
      "PUBLIC_OBJECT_SEARCH_PATHS not set. Object storage must be provisioned before uploading tool images.",
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

export interface ImageDimensions {
  width: number;
  height: number;
  matchesStandard: boolean;
}

export async function analyzeImage(buffer: Buffer): Promise<ImageDimensions> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new Error("Could not read image dimensions");
  }
  const aspect = width / height;
  const matchesStandard = Math.abs(aspect - 1) <= STANDARD_ASPECT_TOLERANCE;
  return { width, height, matchesStandard };
}

/**
 * Resizes the image to the standard square, preserving aspect ratio by
 * padding with a transparent background (never cropping or stretching), and
 * re-encodes as optimized WebP. Uploads the result to the public object
 * storage search path and returns the URL to store on the product.
 */
export async function processAndStoreToolImage(
  buffer: Buffer,
  productId: number,
): Promise<string> {
  const processed = await sharp(buffer)
    .resize(STANDARD_IMAGE_SIZE, STANDARD_IMAGE_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 82 })
    .toBuffer();

  const relativePath = `tool-images/${productId}-${randomUUID()}.webp`;
  const fullPath = `${firstPublicSearchPath()}/${relativePath}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(processed, {
    contentType: "image/webp",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
  });

  return `/api/storage/public-objects/${relativePath}`;
}
