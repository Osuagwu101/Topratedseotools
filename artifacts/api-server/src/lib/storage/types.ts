import type { Readable } from "stream";

/**
 * Every file-storage operation the app needs, expressed against a logical
 * `key` (a relative path like "blog-media/featured/xyz-abcd.webp") rather
 * than any bucket/provider-specific concept. Swapping the backend that
 * implements this interface is the only thing that should ever need to
 * change to move hosting providers — no call site should know or care
 * which backend is active.
 *
 * All objects managed through this interface are public: there is no
 * authenticated/ACL-gated object flow in this app (see storage/index.ts
 * for why that code path was removed rather than ported).
 */
export interface StorageObjectMeta {
  key: string;
  sizeBytes: number;
  updatedAt: string | null;
  /** Content hash (e.g. MD5), used by Storage Manager to find exact-duplicate files. Null if the backend can't provide one cheaply. */
  contentHash: string | null;
}

export interface StorageReadResult {
  stream: Readable;
  contentType: string;
  sizeBytes?: number;
}

export interface StorageBackend {
  /** Short identifier for logs/health checks, e.g. "replit", "s3", "local". */
  readonly kind: string;

  putObject(key: string, data: Buffer, opts: { contentType: string; cacheControl?: string }): Promise<void>;

  getObjectStream(key: string): Promise<StorageReadResult | null>;

  objectExists(key: string): Promise<boolean>;

  deleteObject(key: string): Promise<void>;

  /** Lists every object currently stored, regardless of prefix. Used by Storage Manager for usage stats and cleanup. */
  listObjects(): Promise<StorageObjectMeta[]>;

  /** A quick, cheap check that the backend is reachable and correctly configured (used by System Health / Emergency Recovery). */
  checkHealth(): Promise<{ ok: boolean; message: string }>;
}
