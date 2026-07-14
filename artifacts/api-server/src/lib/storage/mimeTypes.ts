const EXT_TO_MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

/** Best-effort content-type guess from a file extension. Only used as a fallback when a backend has no real metadata store (local disk with a missing/corrupt sidecar file). */
export default function guessMimeType(filePath: string): string {
  const match = /\.[a-z0-9]+$/i.exec(filePath);
  if (!match) return "application/octet-stream";
  return EXT_TO_MIME[match[0].toLowerCase()] ?? "application/octet-stream";
}
