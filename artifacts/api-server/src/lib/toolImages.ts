import sharp from "sharp";
import { randomUUID } from "crypto";
import { putPublicObject } from "./storage";

// Standard square dimensions all tool logos are normalized to for a consistent
// storefront grid. Uploaded images are checked against these exact dimensions;
// any mismatch (wrong size and/or aspect ratio) prompts the admin to confirm
// an automatic resize rather than silently distorting or rejecting the upload.
export const STANDARD_IMAGE_SIZE = 512;

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
  const matchesStandard = width === STANDARD_IMAGE_SIZE && height === STANDARD_IMAGE_SIZE;
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

  return putPublicObject(relativePath, processed, {
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });
}
