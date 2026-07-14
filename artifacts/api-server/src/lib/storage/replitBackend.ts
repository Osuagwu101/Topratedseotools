import { Storage, type File } from "@google-cloud/storage";
import type { Readable } from "stream";
import type { StorageBackend, StorageObjectMeta, StorageReadResult } from "./types";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

/**
 * Replit's managed object storage (a GCS bucket fronted by the workspace
 * sidecar for credentials). This backend only works inside a Replit
 * workspace/deployment — it's kept as an option so the app keeps working
 * unmodified here, but it is never the *only* option: `s3` and `local` are
 * the portable choices for running anywhere else (see storage/index.ts).
 */
interface ParsedPath {
  bucket: string;
  prefix: string;
}

export class ReplitObjectStorageBackend implements StorageBackend {
  readonly kind = "replit";
  private readonly client: Storage;
  // Mirrors the pre-refactor `ObjectStorageService`: PUBLIC_OBJECT_SEARCH_PATHS
  // can list multiple search paths (comma-separated), and reads/exists/list
  // must check ALL of them (first match wins) to avoid 404-ing on objects
  // that live in a secondary configured path. Writes/deletes always target
  // the FIRST path, exactly like the old direct-GCS code in blogImages.ts /
  // toolImages.ts / trust.ts / siteSettings.ts did before this refactor.
  private readonly paths: ParsedPath[];

  constructor(searchPaths: string[]) {
    if (searchPaths.length === 0) {
      throw new Error("ReplitObjectStorageBackend requires at least one search path.");
    }
    this.client = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
        type: "external_account",
        credential_source: {
          url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
          format: { type: "json", subject_token_field_name: "access_token" },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
    this.paths = searchPaths.map((searchPath) => {
      const normalized = searchPath.startsWith("/") ? searchPath.slice(1) : searchPath;
      const parts = normalized.split("/");
      return { bucket: parts[0], prefix: parts.slice(1).join("/") };
    });
  }

  private objectName(prefix: string, key: string): string {
    return prefix ? `${prefix}/${key}` : key;
  }

  private get writePath(): ParsedPath {
    return this.paths[0];
  }

  async putObject(key: string, data: Buffer, opts: { contentType: string; cacheControl?: string }): Promise<void> {
    const { bucket, prefix } = this.writePath;
    const file = this.client.bucket(bucket).file(this.objectName(prefix, key));
    await file.save(data, {
      contentType: opts.contentType,
      metadata: opts.cacheControl ? { cacheControl: opts.cacheControl } : undefined,
    });
  }

  async getObjectStream(key: string): Promise<StorageReadResult | null> {
    for (const { bucket, prefix } of this.paths) {
      const file = this.client.bucket(bucket).file(this.objectName(prefix, key));
      const [exists] = await file.exists();
      if (!exists) continue;
      const [metadata] = await file.getMetadata();
      return {
        stream: file.createReadStream() as unknown as Readable,
        contentType: (metadata.contentType as string) || "application/octet-stream",
        sizeBytes: metadata.size ? Number(metadata.size) : undefined,
      };
    }
    return null;
  }

  async objectExists(key: string): Promise<boolean> {
    for (const { bucket, prefix } of this.paths) {
      const [exists] = await this.client.bucket(bucket).file(this.objectName(prefix, key)).exists();
      if (exists) return true;
    }
    return false;
  }

  async deleteObject(key: string): Promise<void> {
    const { bucket, prefix } = this.writePath;
    await this.client.bucket(bucket).file(this.objectName(prefix, key)).delete({ ignoreNotFound: true });
  }

  async listObjects(): Promise<StorageObjectMeta[]> {
    const byKey = new Map<string, StorageObjectMeta>();
    for (const { bucket, prefix } of this.paths) {
      const [files] = await this.client.bucket(bucket).getFiles({ prefix: prefix ? `${prefix}/` : undefined });
      for (const file of files as File[]) {
        const [metadata] = await file.getMetadata();
        const key = prefix && file.name.startsWith(`${prefix}/`) ? file.name.slice(prefix.length + 1) : file.name;
        if (byKey.has(key)) continue; // first path wins, same precedence as reads
        byKey.set(key, {
          key,
          sizeBytes: Number(metadata.size ?? 0),
          updatedAt: (metadata.updated as string) ?? null,
          contentHash: (metadata.md5Hash as string) ?? null,
        });
      }
    }
    return Array.from(byKey.values());
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    try {
      const { bucket, prefix } = this.writePath;
      await this.client.bucket(bucket).getFiles({ prefix: prefix ? `${prefix}/` : undefined, maxResults: 1 });
      return { ok: true, message: `Connected to Replit-managed bucket "${bucket}".` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not reach Replit object storage." };
    }
  }
}
