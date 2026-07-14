import { promises as fs, createReadStream } from "fs";
import path from "path";
import crypto from "crypto";
import mime from "./mimeTypes";
import type { StorageBackend, StorageObjectMeta, StorageReadResult } from "./types";

/**
 * Stores files on local disk. Meant for a Hostinger VPS (or any single-server
 * deployment) with no external object storage — the app itself both writes
 * and serves the files, so no separate CDN/bucket is required to run.
 *
 * Not suitable for multi-instance/autoscaled deployments (each instance
 * would have its own disk), which is why "replit" and "s3" remain the
 * default recommendations for anything horizontally scaled.
 */
export class LocalDiskStorageBackend implements StorageBackend {
  readonly kind = "local";

  constructor(private readonly rootDir: string) {}

  private resolveSafe(key: string): string {
    // Reject path traversal — every key must resolve to a path inside rootDir.
    const resolvedRoot = path.resolve(this.rootDir);
    const resolvedPath = path.resolve(resolvedRoot, key);
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Refusing to access storage key outside root: ${key}`);
    }
    return resolvedPath;
  }

  async putObject(key: string, data: Buffer, opts: { contentType: string; cacheControl?: string }): Promise<void> {
    const filePath = this.resolveSafe(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    // Local disk has no native content-type/metadata store; persist it
    // alongside the file so getObjectStream() can report the right
    // Content-Type header when serving it back.
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType: opts.contentType, cacheControl: opts.cacheControl ?? null }));
  }

  async getObjectStream(key: string): Promise<StorageReadResult | null> {
    const filePath = this.resolveSafe(key);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    let contentType = "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(`${filePath}.meta.json`, "utf8"));
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // No/unreadable metadata sidecar — fall back to extension-based guess.
      contentType = mime(filePath);
    }
    return { stream: createReadStream(filePath), contentType, sizeBytes: stat.size };
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.resolveSafe(key));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const filePath = this.resolveSafe(key);
    await fs.rm(filePath, { force: true });
    await fs.rm(`${filePath}.meta.json`, { force: true });
  }

  async listObjects(): Promise<StorageObjectMeta[]> {
    const results: StorageObjectMeta[] = [];
    const root = path.resolve(this.rootDir);
    async function walk(dir: string) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile() && !entry.name.endsWith(".meta.json")) {
          const stat = await fs.stat(full);
          const buffer = await fs.readFile(full);
          const contentHash = crypto.createHash("md5").update(buffer).digest("hex");
          results.push({
            key: path.relative(root, full).split(path.sep).join("/"),
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
            contentHash,
          });
        }
      }
    }
    await walk(root);
    return results;
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    try {
      await fs.mkdir(this.rootDir, { recursive: true });
      const probePath = path.join(this.rootDir, ".health-check");
      await fs.writeFile(probePath, "ok");
      await fs.rm(probePath, { force: true });
      return { ok: true, message: `Local disk storage writable at ${path.resolve(this.rootDir)}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Local storage directory is not writable." };
    }
  }
}
