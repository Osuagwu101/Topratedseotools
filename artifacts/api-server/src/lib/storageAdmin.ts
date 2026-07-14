import {
  db,
  productsTable,
  blogPostsTable,
  siteSettingsTable,
  testimonialsTable,
  staffUsersTable,
  paymentMethodsTable,
} from "@workspace/db";
import { getStorageBackend, invalidateStorageBackendCache, publicObjectUrl } from "./storage";
import type { StorageObjectMeta } from "./storage/types";
import type { ServiceHealth } from "./systemHealth";

export interface StorageObjectInfo {
  key: string;
  sizeBytes: number;
  updatedAt: string | null;
  referenced: boolean;
  contentHash: string | null;
}

export interface StorageSummary {
  backend: string;
  totalBytes: number;
  totalFiles: number;
  unusedFiles: number;
  unusedBytes: number;
  objects: StorageObjectInfo[];
  computedAt: string;
}

// Uploads younger than this are never considered "unused", even if nothing
// references them yet — a customer/admin upload flow writes the object
// first and only saves the DB row referencing it a moment later, so a file
// that's simply mid-flow must never be swept up as garbage.
const UNREFERENCED_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Every URL/path column across the app that can point at an uploaded object.
 * Used to distinguish "in use" from "orphaned" storage objects. New upload
 * call sites should add their column here so Storage Manager doesn't flag
 * live assets as unused.
 */
async function collectReferencedKeys(): Promise<Set<string>> {
  const refs = new Set<string>();
  const addRaw = (value: string | null | undefined) => {
    if (!value) return;
    // Stored URLs look like "/api/storage/public-objects/<key>" — reduce to
    // the bare key so it matches what listObjects() reports. Also keep the
    // raw value in case any legacy row still stores a bare key or full URL.
    const marker = "/api/storage/public-objects/";
    const idx = value.indexOf(marker);
    if (idx >= 0) refs.add(value.slice(idx + marker.length));
    refs.add(value);
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

function isReferenced(key: string, refs: Set<string>): boolean {
  if (refs.has(key)) return true;
  if (refs.has(publicObjectUrl(key))) return true;
  return false;
}

// Listing every object's metadata can be non-trivial work for large buckets,
// so cache the result briefly. Every mutating action below (delete/optimize)
// invalidates it immediately so the admin never sees stale counts after acting.
let cache: { value: StorageSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateStorageCache(): void {
  cache = null;
}

async function computeSummary(): Promise<StorageSummary> {
  const backend = await getStorageBackend();
  const [refs, rawObjects] = await Promise.all([collectReferencedKeys(), backend.listObjects()]);

  const now = Date.now();
  const objects: StorageObjectInfo[] = rawObjects.map((obj: StorageObjectMeta) => ({
    key: obj.key,
    sizeBytes: obj.sizeBytes,
    updatedAt: obj.updatedAt,
    referenced: isReferenced(obj.key, refs),
    contentHash: obj.contentHash,
  }));

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
    backend: backend.kind,
    totalBytes: objects.reduce((sum, o) => sum + o.sizeBytes, 0),
    totalFiles: objects.length,
    unusedFiles,
    unusedBytes,
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
    const backend = await getStorageBackend();
    const health = await backend.checkHealth();
    if (!health.ok) {
      return { key: "storage", label: "Storage", status: "error", summary: health.message };
    }
    const summary = await getStorageSummary();
    const mb = (summary.totalBytes / (1024 * 1024)).toFixed(1);
    return {
      key: "storage",
      label: "Storage",
      status: "healthy",
      summary: `[${backend.kind}] ${summary.totalFiles} files, ${mb}MB used${summary.unusedFiles ? `, ${summary.unusedFiles} unused` : ""}.`,
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
  const backend = await getStorageBackend();
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
    const freshRefs = await collectReferencedKeys();
    if (isReferenced(obj.key, freshRefs)) continue;
    try {
      await backend.deleteObject(obj.key);
      deleted += 1;
      freedBytes += obj.sizeBytes;
    } catch (err) {
      errors.push(`${obj.key}: ${err instanceof Error ? err.message : String(err)}`);
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
  const backend = await getStorageBackend();
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
      const freshRefs = await collectReferencedKeys();
      if (isReferenced(dup.key, freshRefs)) continue;
      try {
        await backend.deleteObject(dup.key);
        deleted += 1;
        freedBytes += dup.sizeBytes;
      } catch (err) {
        errors.push(`${dup.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  invalidateStorageCache();
  return { deleted, freedBytes, errors };
}

export { invalidateStorageBackendCache };
