import { execFile } from "child_process";
import { gzipSync } from "zlib";
import { randomUUID } from "crypto";
import {
  db,
  backupsTable,
  productsTable,
  toolServersTable,
  toolAssignmentsTable,
  ordersTable,
  orderAttributionsTable,
  userDeviceSessionsTable,
  userDailyUsageTable,
  toolEntitlementsTable,
  siteSettingsTable,
  paymentSettingsTable,
  emailSettingsTable,
  featureFlagsTable,
  analyticsSettingsTable,
  storageSettingsTable,
  systemConfigTable,
  seoGeneratorSettingsTable,
  type StaffUser,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getStorageBackend } from "./storage";
import { logger } from "./logger";

export type BackupScope = "full" | "database" | "products" | "orders" | "users" | "purchases" | "settings" | "downloads";

export interface BackupScopeDefinition {
  key: BackupScope;
  label: string;
  description: string;
  type: "full" | "database" | "partial";
}

export const BACKUP_SCOPES: BackupScopeDefinition[] = [
  {
    key: "full",
    label: "Entire system",
    description: "Full database dump plus a manifest of every stored file (images, downloads).",
    type: "full",
  },
  {
    key: "database",
    label: "Database only",
    description: "Full database dump (every table). Does not include object-storage files.",
    type: "database",
  },
  { key: "products", label: "Products only", description: "Product catalog, tool servers, and tool assignments.", type: "partial" },
  { key: "orders", label: "Orders only", description: "Orders and their attribution records.", type: "partial" },
  { key: "users", label: "Users only", description: "Locally-mirrored device sessions and daily usage (customer accounts themselves live in Clerk).", type: "partial" },
  { key: "purchases", label: "Purchases only", description: "Tool entitlements — what each customer currently has access to.", type: "partial" },
  { key: "settings", label: "Settings only", description: "Site, payment, email, feature-flag, analytics, storage, and AI settings.", type: "partial" },
  { key: "downloads", label: "Downloads only", description: "Every file currently in object storage, captured before a storage-cleanup action.", type: "partial" },
];

const scopesByKey = new Map<string, BackupScopeDefinition>(BACKUP_SCOPES.map((s) => [s.key, s]));

export function getBackupScopeDefinition(key: string): BackupScopeDefinition | undefined {
  return scopesByKey.get(key);
}

function runPgDump(): Promise<string> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is not set."));
      return;
    }
    execFile(
      "pg_dump",
      ["--no-owner", "--no-privileges", databaseUrl],
      { maxBuffer: 1024 * 1024 * 512 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString().slice(0, 2000) || err.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function buildPartialPayload(scope: BackupScope): Promise<Record<string, unknown[]>> {
  switch (scope) {
    case "products":
      return {
        products: await db.select().from(productsTable),
        toolServers: await db.select().from(toolServersTable),
        toolAssignments: await db.select().from(toolAssignmentsTable),
      };
    case "orders":
      return {
        orders: await db.select().from(ordersTable),
        orderAttributions: await db.select().from(orderAttributionsTable),
      };
    case "users":
      return {
        userDeviceSessions: await db.select().from(userDeviceSessionsTable),
        userDailyUsage: await db.select().from(userDailyUsageTable),
      };
    case "purchases":
      return {
        toolEntitlements: await db.select().from(toolEntitlementsTable),
      };
    case "settings":
      return {
        siteSettings: await db.select().from(siteSettingsTable),
        paymentSettings: await db.select().from(paymentSettingsTable),
        emailSettings: await db.select().from(emailSettingsTable),
        featureFlags: await db.select().from(featureFlagsTable),
        analyticsSettings: await db.select().from(analyticsSettingsTable),
        storageSettings: await db.select().from(storageSettingsTable),
        // Values here are already encrypted at rest (System Configuration
        // Centre) — the ciphertext is harmless to include and lets a
        // restore bring back saved API/payment credentials verbatim.
        systemConfig: await db.select().from(systemConfigTable),
        aiSettings: await db.select().from(seoGeneratorSettingsTable),
      };
    case "downloads": {
      // Captures the actual file bytes (base64), not just a manifest — this
      // scope exists specifically to back up storage-cleanup actions
      // (delete-unused / optimize) that permanently discard object bytes,
      // so "backup" has to mean something recoverable, not just a listing.
      const backend = await getStorageBackend();
      const objects = await backend.listObjects();
      const files: { key: string; sizeBytes: number; updatedAt: string | null; contentBase64: string | null }[] = [];
      for (const obj of objects) {
        try {
          const result = await backend.getObjectStream(obj.key);
          if (!result) {
            files.push({ key: obj.key, sizeBytes: obj.sizeBytes, updatedAt: obj.updatedAt, contentBase64: null });
            continue;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of result.stream) chunks.push(chunk as Buffer);
          files.push({ key: obj.key, sizeBytes: obj.sizeBytes, updatedAt: obj.updatedAt, contentBase64: Buffer.concat(chunks).toString("base64") });
        } catch (err) {
          logger.error({ err, key: obj.key }, "Failed to read storage object for downloads backup");
          files.push({ key: obj.key, sizeBytes: obj.sizeBytes, updatedAt: obj.updatedAt, contentBase64: null });
        }
      }
      return { files };
    }
    default:
      throw new Error(`Unknown partial backup scope: ${scope}`);
  }
}

export interface CreateBackupOptions {
  scope: BackupScope;
  trigger: string; // "manual" or a risky-operation key
  actor?: StaffUser | undefined;
}

/**
 * Runs a backup end-to-end: exports the requested scope, compresses it, and
 * stores the artifact through the active object-storage backend (whichever
 * provider is configured in Storage Manager) rather than a bespoke backup
 * store — so backups move with the app if the storage backend is ever
 * migrated. Always records a row (running -> completed/failed) so history
 * is never lost even when a backup fails partway through.
 */
export async function createBackup(opts: CreateBackupOptions): Promise<{ id: number; status: string }> {
  const def = getBackupScopeDefinition(opts.scope);
  if (!def) throw new Error(`Unknown backup scope: ${opts.scope}`);

  const [row] = await db
    .insert(backupsTable)
    .values({
      type: def.type,
      scope: def.key,
      status: "running",
      trigger: opts.trigger,
      createdByStaffId: opts.actor?.id ?? null,
      createdByEmail: opts.actor?.email ?? null,
    })
    .returning();

  try {
    let envelope: Record<string, unknown>;
    if (def.type === "full" || def.type === "database") {
      const sqlDump = await runPgDump();
      envelope = { kind: def.key, generatedAt: new Date().toISOString(), sqlDump };
      if (def.key === "full") {
        const backend = await getStorageBackend();
        const objects = await backend.listObjects();
        envelope.storageManifest = { backend: backend.kind, objects };
      }
    } else {
      const payload = await buildPartialPayload(def.key);
      envelope = { kind: def.key, generatedAt: new Date().toISOString(), tables: payload };
    }

    const json = JSON.stringify(envelope);
    const compressed = gzipSync(Buffer.from(json, "utf8"));
    const storagePath = `backups/${def.key}-${row.id}-${randomUUID().slice(0, 8)}.json.gz`;
    const backend = await getStorageBackend();
    await backend.putObject(storagePath, compressed, { contentType: "application/gzip" });

    await db
      .update(backupsTable)
      .set({ status: "completed", sizeBytes: compressed.byteLength, storagePath, completedAt: new Date() })
      .where(eq(backupsTable.id, row.id));

    logger.info({ backupId: row.id, scope: def.key, sizeBytes: compressed.byteLength }, "Backup completed");
    return { id: row.id, status: "completed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(backupsTable).set({ status: "failed", errorMessage: message, completedAt: new Date() }).where(eq(backupsTable.id, row.id));
    logger.error({ err, backupId: row.id, scope: def.key }, "Backup failed");
    throw err;
  }
}

export async function listBackups(): Promise<(typeof backupsTable.$inferSelect)[]> {
  return db.select().from(backupsTable).orderBy(desc(backupsTable.createdAt)).limit(200);
}

export async function getBackup(id: number): Promise<typeof backupsTable.$inferSelect | undefined> {
  const [row] = await db.select().from(backupsTable).where(eq(backupsTable.id, id));
  return row;
}
