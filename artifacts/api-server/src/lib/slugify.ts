/** Converts a string into a clean, lowercase, hyphenated URL slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Cleans an uploaded filename to a lowercase, hyphenated, SEO-friendly form. */
export function cleanFilename(filename: string): string {
  const dotIdx = filename.lastIndexOf(".");
  const base = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const ext = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase() : "";
  const cleanBase = slugify(base) || "image";
  return ext ? `${cleanBase}.${ext}` : cleanBase;
}

/**
 * Appends -2, -3, ... to a base slug until `exists` reports it's free.
 * `exists` should check uniqueness against the DB (optionally excluding one id).
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const cleanBase = slugify(base) || "post";
  let candidate = cleanBase;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${cleanBase}-${n}`;
    n += 1;
  }
  return candidate;
}

/** Rough reading-time estimate (words / 200wpm, min 1 minute) from HTML content. */
export function estimateReadingTimeMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
