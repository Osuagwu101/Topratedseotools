import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import type { StorageBackend, StorageObjectMeta, StorageReadResult } from "./types";

export interface S3BackendConfig {
  bucket: string;
  region: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Any S3-compatible object storage: real AWS S3, MinIO, DigitalOcean Spaces,
 * Cloudflare R2, Hostinger's own object storage if/when offered, etc.
 * Which provider it talks to is entirely a matter of `endpoint` — the app
 * code never needs to change.
 */
export class S3StorageBackend implements StorageBackend {
  readonly kind = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3BackendConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: !!config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(key: string, data: Buffer, opts: { contentType: string; cacheControl?: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: opts.contentType,
        CacheControl: opts.cacheControl,
      }),
    );
  }

  async getObjectStream(key: string): Promise<StorageReadResult | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) return null;
      return {
        stream: result.Body as Readable,
        contentType: result.ContentType || "application/octet-stream",
        sizeBytes: result.ContentLength,
      };
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async listObjects(): Promise<StorageObjectMeta[]> {
    const results: StorageObjectMeta[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: continuationToken }),
      );
      for (const obj of page.Contents ?? []) {
        if (!obj.Key) continue;
        results.push({
          key: obj.Key,
          sizeBytes: obj.Size ?? 0,
          updatedAt: obj.LastModified ? obj.LastModified.toISOString() : null,
          contentHash: obj.ETag ? obj.ETag.replace(/"/g, "") : null,
        });
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return results;
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
      return { ok: true, message: `Connected to S3 bucket "${this.bucket}".` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Could not reach S3-compatible storage." };
    }
  }
}

function isNotFoundError(err: unknown): boolean {
  const code = (err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } })?.name;
  const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  return code === "NoSuchKey" || code === "NotFound" || httpStatus === 404;
}
