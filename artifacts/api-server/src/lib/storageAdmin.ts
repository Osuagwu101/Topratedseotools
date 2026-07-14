import {
  db,
  productsTable,
  blogPostsTable,
  siteSettingsTable,
  testimonialsTable,
  staffUsersTable,
  paymentMethodsTable,
} from "@workspace/db";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";
import type { ServiceHealth } from "./systemHealth";

export interface StorageObjectInfo {
  bucket: string;
  path: string;
  sizeBytes: number;
  updatedAt: string | null;
  referenced: boolean;
  contentHash: string | null;
}

export interface StorageSummary {
  totalBytes: number;
  totalFiles: number;
  unusedFiles: number;
  unusedBytes: number;
  buckets: { bucket: string; label: string; fileCount: number; totalBytes: number }[];
  objects: StorageObjectInfo[];
  computedAt: string;
}

// Uploads younger than this are never considered "unused", even if nothing
// references them yet — a customer/admin upload flow writes the object
// first and only saves the DB row referencing it a moment later, so a file
// that's simply mid-flow must never be swept up as garbage.
const UNREFERENCED_GRACE_MS = 24 * 60 * 60 * 1000;

function collectSearchPaths(): { bucket: string; prefix: string; label: string }[] {
  const service = new ObjectStorageService();
  const paths: { bucket: string; prefix: string; label: string }[] = [];
  try {
    const privateDir = service.getPrivateObjectDir();
    const parts = privateDir.replace(/^\//, "").split("/");
    paths.push({ bucket: parts[0], prefix: parts.slice(1).join("/"), label: "Private uploads" });
  } catch {
    // Not configured — skip.
  }
  try {
    for (const p of service.getPublicObjectSearchPaths()) {
      const parts = p.replace(/^\//, "").split("/");
      paths.push({ bucket: parts[0], prefix: parts.slice(1).join("/"), label: "Public assets" });
    }
  } catch {
    // Not configured — skip.
  }
  return paths;
}

/**
 * Every URL/path column across the app that can point at an uploaded object.
 * Used to distinguish "in use" from "orphaned" storage objects. New upload
 * call sites should add their column here so Storage Manager doesn't flag
 * live assets as unused.
 */
async function collectReferencedPaths(): Promise<Set<string>> {
  const service = new ObjectStorageService();
  const refs = new Set<string>();
  const addRaw = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = service.normalizeObjectEntityPath(value);
    // Keep both the raw and normalized forms — object names in storage
    // don't carry the "/objects/" prefix, so match on the tail segment too.
    refs.add(value);
    refs.add(normalized);
  };

  // NOTE: siteSettings is treated like every other table here — select all
  // rows, not just the first. Even though the app currently only maintains a
  // single row (id=1), scanning all rows means an old/orphaned row can never
  // cause a live-referenced file to be misclassified as unused.
  const [products, posts, settingsRows, testimonials, staff, methods] = await Promise.all([
    db.select({ imageUrl: productsTable.imageUrl }).from(productsTable),
    db.select({ featuredImageUrl: blogPostsTable.featuredImageUrl, ogImageUrl: blogPostsTable.ogImageUrl }).from(blogPostsTable),
    db.select({
      siteLogoUrl: siteSettingsTable.siteLogoUrl,
      heroImageUrl: siteSettingsTable.heroImageUrl,
      seoOgImageUrl: siteSettingsTable.seoOgImageUrl,
    }).from(siteSettingsTable),
    db.select({ avatarUrl: testimonialsTable.avatarUrl }).from(testimonialsTable),
    db.select({ avatarUrl: staffUsersTable.avatarUrl }).from(staffUsersTable),
    db.select({ iconUrl: paymentMethodsTable.iconUrl }).from(paymentMethodsTable),
  ]);

  for (const p of products) addRaw(p.imageUrl);
  for (const p of posts) {
    addRaw(p.featuredImageUrl);
    addRaw(p.ogImageUrl);
  }
  for (const settings of settingsRows) {
    addRaw(settings.siteLogoUrl);
    addRaw(settings.heroImageUrl);
    addRaw(settings.seoOgImageUrl);
  }
  for (const t of testimonials) addRaw(t.avatarUrl);
  for (const s of staff) addRaw(s.avatarUrl);
  for (const m of methods) addRaw(m.iconUrl);

  return refs;
}

function isReferenced(fullObjectPath: string, refs: Set<string>): boolean {
  if (refs.has(fullObjectPath)) return true;
  if (refs.has(`/${fullObjectPath}`)) return true;
  // Also match on just the trailing entity id, which is how
  // normalizeObjectEntityPath()'s "/objects/<id>" form compares.
  const tail = fullObjectPath.split("/").pop();
  if (tail) {
    for (const r of refs) {
      if (r.endsWith(tail)) return true;
    }
  }
  return false;
}

// Listing every object's metadata from GCS is not cheap, so cache the result
// briefly. Every mutating action below (delete/optimize) invalidates it
// immediately so the admin never sees stale counts after acting.
let cache: { value: StorageSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateStorageCache(): void {
  cache = null;
}

async function computeSummary(): Promise<StorageSummary> {
  const searchPaths = collectSearchPaths();
  const refs = await collectReferencedPaths();
  const objects: StorageObjectInfo[] = [];
  const bucketTotals = new Map<string, { label: string; fileCount: number; totalBytes: number }>();

  for (const { bucket, prefix, label } of searchPaths) {
    const bucketRef = objectStorageClient.bucket(bucket);
    const [files] = await bucketRef.getFiles({ prefix: prefix ? `${prefix}/` : undefined });
    const existing = bucketTotals.get(bucket) ?? { label, fileCount: 0, totalBytes: 0 };
    for (const file of files) {
      const [metadata] = await file.getMetadata();
      const size = Number(metadata.size ?? 0);
      const fullPath = `${bucket}/${file.name}`;
      existing.fileCount += 1;
      existing.totalBytes += size;
      objects.push({
        bucket,
        path: fullPath,
        sizeBytes: size,
        updatedAt: (metadata.updated as string) ?? null,
        referenced: isReferenced(fullPath, refs),
        contentHash: (metadata.md5Hash as string) ?? null,
      });
    }
    bucketTotals.set(bucket, existing);
  }

  const now = Date.now();
  let unusedFiles = 0;
  let unusedBytes = 0;
  for (const obj of objects) {
    const ageMs = obj.updatedAt ? now - new Date(obj.updatedAt).getTime() : Infinity;
    if (!obj.referenced && ageMs > UNREFERENCED_GRACE_MS) {
      unusedFiles += 1;
      unusedBytes += obj.sizeBytes;
    }
  }

  return {
    totalBytes: objects.reduce((sum, o) => sum + o.sizeBytes, 0),
    totalFiles: objects.length,
    unusedFiles,
    unusedBytes,
    buckets: Array.from(bucketTotals.entries()).map(([bucket, v]) => ({ bucket, ...v })),
    objects,
    computedAt: new Date().toISOString(),
  };
}

export async function getStorageSummary(forceRefresh = false): Promise<StorageSummary> {
  const now = Date.now();
  if (!forceRefresh && cache && cache.expiresAt > now) return cache.value;
  const value = await computeSummary();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function getStorageHealth(): Promise<ServiceHealth> {
  try {
    const searchPaths = collectSearchPaths();
    if (searchPaths.length === 0) {
      return { key: "storage", label: "Storage", status: "error", summary: "No object storage bucket is configured." };
    }
    const summary = await getStorageSummary();
    const mb = (summary.totalBytes / (1024 * 1024)).toFixed(1);
    return {
      key: "storage",
      label: "Storage",
      status: "healthy",
      summary: `${summary.totalFiles} files, ${mb}MB used${summary.unusedFiles ? `, ${summary.unusedFiles} unused` : ""}.`,
    };
  } catch (err) {
    return {
      key: "storage",
      label: "Storage",
      status: "error",
      summary: err instanceof Error ? err.message : "Could not reach object storage.",
    };
  }
}

/**
 * Deletes every currently-unused object (unreferenced by any known DB
 * column and older than the grace period). Never deletes a referenced file
 * regardless of age, and never touches any database row — only the
 * underlying storage object.
 */
export async function deleteUnusedFiles(): Promise<{ deleted: number; freedBytes: number; errors: string[] }> {
  const summary = await getStorageSummary(true);
  const now = Date.now();
  const errors: string[] = [];
  let deleted = 0;
  let freedBytes = 0;

  const candidates = summary.objects.filter((obj) => {
    const ageMs = obj.updatedAt ? now - new Date(obj.updatedAt).getTime() : Infinity;
    return !obj.referenced && ageMs > UNREFERENCED_GRACE_MS;
  });

  for (const obj of candidates) {
    // Re-check references immediately before deleting: a file can go from
    // unreferenced to referenced between the scan above and this delete
    // (e.g. an admin picks it as a new hero image right after the scan). A
    // stale snapshot must never cause a live asset to be deleted.
    const freshRefs = await collectReferencedPaths();
    if (isReferenced(obj.path, freshRefs)) continue;
    try {
      const objectName = obj.path.slice(obj.bucket.length + 1);
      await objectStorageClient.bucket(obj.bucket).file(objectName).delete();
      deleted += 1;
      freedBytes += obj.sizeBytes;
    } catch (err) {
      errors.push(`${obj.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  invalidateStorageCache();
  return { deleted, freedBytes, errors };
}

/**
 * "Optimize storage": finds exact-duplicate unused files (same content
 * hash) and removes all but one copy. Deliberately scoped to the unused set
 * only — a referenced file is never removed even if a byte-identical unused
 * copy also exists, since it's not this tool's place to guess which name a
 * consumer expects.
 */
export async function optimizeStorage(): Promise<{ deleted: number; freedBytes: number; errors: string[] }> {
  const summary = await getStorageSummary(true);
  const now = Date.now();
  const unusedByHash = new Map<string, StorageObjectInfo[]>();
  for (const obj of summary.objects) {
    const ageMs = obj.updatedAt ? now - new Date(obj.updatedAt).getTime() : Infinity;
    if (obj.referenced || ageMs <= UNREFERENCED_GRACE_MS || !obj.contentHash) continue;
    const group = unusedByHash.get(obj.contentHash) ?? [];
    group.push(obj);
    unusedByHash.set(obj.contentHash, group);
  }

  const errors: string[] = [];
  let deleted = 0;
  let freedBytes = 0;
  for (const group of unusedByHash.values()) {
    if (group.length < 2) continue;
    // Keep the newest, remove the rest.
    const sorted = [...group].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    for (const dup of sorted.slice(1)) {
      // Re-check references immediately before deleting — same TOCTOU
      // concern as deleteUnusedFiles(): the scan above can be stale by the
      // time we get to this specific duplicate.
      const freshRefs = await collectReferencedPaths();
      if (isReferenced(dup.path, freshRefs)) continue;
      try {
        const objectName = dup.path.slice(dup.bucket.length + 1);
        await objectStorageClient.bucket(dup.bucket).file(objectName).delete();
        deleted += 1;
        freedBytes += dup.sizeBytes;
      } catch (err) {
        errors.push(`${dup.path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  invalidateStorageCache();
  return { deleted, freedBytes, errors };
}
