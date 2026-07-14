import type { StorageBackend } from "./types";
import { LocalDiskStorageBackend } from "./localBackend";
import { S3StorageBackend } from "./s3Backend";
import { ReplitObjectStorageBackend } from "./replitBackend";
import { getStorageSettings, invalidateStorageSettingsCache, type StorageSettings } from "./settings";
import { getConfigValue } from "../systemConfig";

export type { StorageBackend, StorageObjectMeta, StorageReadResult } from "./types";
export {
  getStorageSettings,
  updateStorageSettings,
  invalidateStorageSettingsCache,
  type StorageBackendKind,
} from "./settings";

let cachedBackend: { key: string; backend: StorageBackend } | null = null;

function backendCacheKey(settings: StorageSettings, s3AccessKeyId: string | null, s3SecretAccessKey: string | null): string {
  // Must include the secret itself (not just the key id) — an admin can
  // rotate the secret while keeping the same access key id, and that MUST
  // invalidate any cached S3 client, or writes/reads keep using the old
  // credential until a restart.
  return JSON.stringify({
    backend: settings.backend,
    localDir: settings.localDir,
    s3Bucket: settings.s3Bucket,
    s3Region: settings.s3Region,
    s3Endpoint: settings.s3Endpoint,
    s3ForcePathStyle: settings.s3ForcePathStyle,
    s3AccessKeyId,
    s3SecretAccessKey,
  });
}

async function buildBackend(settings: StorageSettings): Promise<StorageBackend> {
  if (settings.backend === "local") {
    return new LocalDiskStorageBackend(settings.localDir);
  }
  if (settings.backend === "s3") {
    const accessKeyId = await getConfigValue("STORAGE_S3_ACCESS_KEY_ID");
    const secretAccessKey = await getConfigValue("STORAGE_S3_SECRET_ACCESS_KEY");
    if (!settings.s3Bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 storage backend is selected but not fully configured — set the bucket in Storage Manager and the access key/secret in the System Configuration Centre.",
      );
    }
    return new S3StorageBackend({
      bucket: settings.s3Bucket,
      region: settings.s3Region || "us-east-1",
      endpoint: settings.s3Endpoint,
      forcePathStyle: settings.s3ForcePathStyle,
      accessKeyId,
      secretAccessKey,
    });
  }
  // "replit" — mirrors the pre-refactor behavior of searching every
  // configured path (comma-separated), not just the first one, so objects
  // stored under a secondary path keep resolving after this refactor.
  const searchPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS || "").split(",").map((p) => p.trim()).filter(Boolean);
  if (searchPaths.length === 0) {
    throw new Error(
      "Storage backend is set to \"replit\" but PUBLIC_OBJECT_SEARCH_PATHS is not set. Switch to \"local\" or \"s3\" in Storage Manager, or provision Replit's Object Storage tool.",
    );
  }
  return new ReplitObjectStorageBackend(searchPaths);
}

/**
 * Returns the currently-configured storage backend, constructing (and
 * briefly caching) it based on the live storage settings row + S3 secrets.
 * Every call site in the app should go through this — never instantiate a
 * backend class directly — so an admin switching backends in Storage
 * Manager takes effect immediately, everywhere, with no restart.
 */
export async function getStorageBackend(): Promise<StorageBackend> {
  const settings = await getStorageSettings();
  const s3AccessKeyId = settings.backend === "s3" ? await getConfigValue("STORAGE_S3_ACCESS_KEY_ID") : null;
  const s3SecretAccessKey = settings.backend === "s3" ? await getConfigValue("STORAGE_S3_SECRET_ACCESS_KEY") : null;
  const key = backendCacheKey(settings, s3AccessKeyId, s3SecretAccessKey);
  if (cachedBackend && cachedBackend.key === key) return cachedBackend.backend;
  const backend = await buildBackend(settings);
  cachedBackend = { key, backend };
  return backend;
}

/**
 * Builds a backend from a settings object without touching the cache — used
 * to preflight-check a candidate configuration (e.g. before persisting an
 * admin's PUT /admin/storage/settings) without disturbing the live backend.
 */
export async function buildStorageBackendForPreflight(settings: StorageSettings): Promise<StorageBackend> {
  return buildBackend(settings);
}

/** Call after any change to storage settings or S3 credentials so the next getStorageBackend() picks it up. */
export function invalidateStorageBackendCache(): void {
  cachedBackend = null;
  invalidateStorageSettingsCache();
}

const PUBLIC_OBJECT_URL_PREFIX = "/api/storage/public-objects/";

/** The URL the app should store/serve for a given storage key — stable across backends so switching backends never breaks previously-stored URLs (the app always fronts reads through its own route). */
export function publicObjectUrl(key: string): string {
  return `${PUBLIC_OBJECT_URL_PREFIX}${key}`;
}

/** Convenience wrapper: process + store a file, returning the URL to persist on the owning record. */
export async function putPublicObject(
  key: string,
  data: Buffer,
  opts: { contentType: string; cacheControl?: string },
): Promise<string> {
  const backend = await getStorageBackend();
  await backend.putObject(key, data, opts);
  return publicObjectUrl(key);
}
