import { execFile } from "child_process";
import { gunzipSync } from "zlib";
import {
  db,
  backupsTable,
  restoresTable,
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
  couponsTable,
  couponRedemptionsTable,
  referralSettingsTable,
  referralCodesTable,
  referralsTable,
  userCreditsTable,
  creditTransactionsTable,
  staffUsersTable,
  staffSessionsTable,
  blogPostsTable,
  reviewsTable,
  testimonialsTable,
  conversionEventsTable,
  paymentMethodsTable,
  configAuditLogTable,
  integrityAuditLogTable,
  protectedDataUnlockLogTable,
  protectedDatasetsTable,
  blogCategoriesTable,
  blogTagsTable,
  blogPostTagsTable,
  blogMediaTable,
  blogRedirectsTable,
  blogCommentsTable,
  blogSettingsTable,
  newsletterSubscribersTable,
  customerCounterAuditTable,
  customerRecoveryLogTable,
  benefitCardsTable,
  howItWorksStepsTable,
  faqItemsTable,
  paymentRecoveryLogTable,
  productRecoveryLogTable,
  keywordResearchSessionsTable,
  keywordResearchItemsTable,
  contentBriefsTable,
  generationJobsTable,
  postSectionVersionsTable,
  seoQualityReportsTable,
  bannedPhrasesTable,
  generationUsageLogTable,
  seoLinkInsightsTable,
  reviewPromptsTable,
  type StaffUser,
} from "@workspace/db";
import { desc, eq, inArray, getTableName } from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { getStorageBackend } from "./storage";
import { logger } from "./logger";
import { getEnvironment } from "./environment";
import { createBackup, getBackupScopeDefinition, type BackupScope } from "./backupEngine";
import { isDatasetUnlocked, getDatasetDefinition, recordDatasetEvent } from "./protectedData";

/** Which protected datasets (Task 1's registry) a given restore scope touches. */
const SCOPE_DATASETS: Record<BackupScope, string[]> = {
  products: ["products"],
  orders: ["orders_purchases", "payment_history"],
  users: ["users"],
  purchases: ["subscriptions"],
  settings: ["website_settings", "payment_settings", "email_settings", "ai_settings"],
  downloads: ["downloads"],
  // Restoring the whole database touches everything this app protects.
  database: [
    "users",
    "products",
    "orders_purchases",
    "payment_history",
    "downloads",
    "subscriptions",
    "coupons",
    "referral_data",
    "website_settings",
    "payment_settings",
    "email_settings",
    "ai_settings",
    "analytics",
  ],
  full: [
    "users",
    "products",
    "orders_purchases",
    "payment_history",
    "downloads",
    "subscriptions",
    "coupons",
    "referral_data",
    "website_settings",
    "payment_settings",
    "email_settings",
    "ai_settings",
    "analytics",
  ],
};

export function getScopeDatasets(scope: BackupScope): string[] {
  return SCOPE_DATASETS[scope] ?? [];
}

async function getBackupOrThrow(backupId: number) {
  const [backup] = await db.select().from(backupsTable).where(eq(backupsTable.id, backupId));
  if (!backup) throw new Error("Backup not found.");
  if (backup.status !== "completed" || !backup.storagePath) throw new Error("This backup did not complete successfully and cannot be restored from.");
  return backup;
}

export async function loadEnvelope(storagePath: string): Promise<Record<string, unknown>> {
  const backend = await getStorageBackend();
  const result = await backend.getObjectStream(storagePath);
  if (!result) throw new Error("Backup artifact is missing from storage.");
  const chunks: Buffer[] = [];
  for await (const chunk of result.stream) chunks.push(chunk as Buffer);
  const json = gunzipSync(Buffer.concat(chunks)).toString("utf8");
  return JSON.parse(json);
}

function normalize(row: unknown): string {
  // Round-trip through JSON so Date objects (from a live DB row) compare
  // equal to their ISO-string form (from a backup envelope that was itself
  // JSON-serialized) when the underlying values are the same.
  return JSON.stringify(JSON.parse(JSON.stringify(row)), Object.keys(JSON.parse(JSON.stringify(row))).sort());
}

interface TableDiff {
  table: string;
  currentCount: number;
  backupCount: number;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

async function diffTable(table: PgTableWithColumns<any>, backupRows: Record<string, unknown>[]): Promise<TableDiff & { table: string }> {
  const currentRows = (await db.select().from(table as any)) as Record<string, unknown>[];
  const currentById = new Map(currentRows.map((r) => [r.id as number, r]));
  const backupById = new Map(backupRows.map((r) => [r.id as number, r]));
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  for (const [id, backupRow] of backupById) {
    const currentRow = currentById.get(id);
    if (!currentRow) added++;
    else if (normalize(currentRow) !== normalize(backupRow)) changed++;
    else unchanged++;
  }
  let removed = 0;
  for (const id of currentById.keys()) {
    if (!backupById.has(id)) removed++;
  }
  return { table: "", currentCount: currentRows.length, backupCount: backupRows.length, added, changed, removed, unchanged };
}

/** Generic replace-restore for one table: delete rows the backup doesn't have, upsert everything the backup does. */
async function restoreTable(tx: typeof db, table: PgTableWithColumns<any>, backupRows: Record<string, unknown>[]): Promise<{ upserted: number; deleted: number }> {
  const currentRows = (await tx.select().from(table as any)) as Record<string, unknown>[];
  const backupIds = new Set(backupRows.map((r) => r.id as number));
  const idsToDelete = currentRows.map((r) => r.id as number).filter((id) => !backupIds.has(id));
  let deleted = 0;
  if (idsToDelete.length > 0) {
    await tx.delete(table as any).where(inArray((table as any).id, idsToDelete));
    deleted = idsToDelete.length;
  }
  for (const row of backupRows) {
    const columns = Object.keys(row).filter((k) => k !== "id");
    const setClause: Record<string, unknown> = {};
    for (const c of columns) setClause[c] = (row as Record<string, unknown>)[c];
    await tx
      .insert(table as any)
      .values(row as never)
      .onConflictDoUpdate({ target: (table as any).id, set: setClause });
  }
  return { upserted: backupRows.length, deleted };
}

const TABLE_MAP: Record<string, PgTableWithColumns<any>> = {
  products: productsTable,
  toolServers: toolServersTable,
  toolAssignments: toolAssignmentsTable,
  orders: ordersTable,
  orderAttributions: orderAttributionsTable,
  userDeviceSessions: userDeviceSessionsTable,
  userDailyUsage: userDailyUsageTable,
  toolEntitlements: toolEntitlementsTable,
  siteSettings: siteSettingsTable,
  paymentSettings: paymentSettingsTable,
  emailSettings: emailSettingsTable,
  featureFlags: featureFlagsTable,
  analyticsSettings: analyticsSettingsTable,
  storageSettings: storageSettingsTable,
  systemConfig: systemConfigTable,
  aiSettings: seoGeneratorSettingsTable,
  // These do not belong to any partial backup scope's tables today — they
  // are only here so a full/database backup's SQL-dump row-count summary
  // can be checked against a live count instead of coming back "not
  // checked" for these business-critical tables.
  coupons: couponsTable,
  couponRedemptions: couponRedemptionsTable,
  referralSettings: referralSettingsTable,
  referralCodes: referralCodesTable,
  referrals: referralsTable,
  userCredits: userCreditsTable,
  creditTransactions: creditTransactionsTable,
  staffUsers: staffUsersTable,
  staffSessions: staffSessionsTable,
  blogPosts: blogPostsTable,
  reviews: reviewsTable,
  testimonials: testimonialsTable,
  conversionEvents: conversionEventsTable,
  paymentMethods: paymentMethodsTable,
  backups: backupsTable,
  restores: restoresTable,
  configAuditLog: configAuditLogTable,
  integrityAuditLog: integrityAuditLogTable,
  protectedDataUnlockLog: protectedDataUnlockLogTable,
  protectedDatasets: protectedDatasetsTable,
  blogCategories: blogCategoriesTable,
  blogTags: blogTagsTable,
  blogPostTags: blogPostTagsTable,
  blogMedia: blogMediaTable,
  blogRedirects: blogRedirectsTable,
  blogComments: blogCommentsTable,
  blogSettings: blogSettingsTable,
  newsletterSubscribers: newsletterSubscribersTable,
  customerCounterAudit: customerCounterAuditTable,
  customerRecoveryLog: customerRecoveryLogTable,
  benefitCards: benefitCardsTable,
  howItWorksSteps: howItWorksStepsTable,
  faqItems: faqItemsTable,
  paymentRecoveryLog: paymentRecoveryLogTable,
  productRecoveryLog: productRecoveryLogTable,
  keywordResearchSessions: keywordResearchSessionsTable,
  keywordResearchItems: keywordResearchItemsTable,
  contentBriefs: contentBriefsTable,
  generationJobs: generationJobsTable,
  postSectionVersions: postSectionVersionsTable,
  seoQualityReports: seoQualityReportsTable,
  bannedPhrases: bannedPhrasesTable,
  generationUsageLog: generationUsageLogTable,
  seoLinkInsights: seoLinkInsightsTable,
  reviewPrompts: reviewPromptsTable,
};

/** Maps a Postgres table name (as it appears in a pg_dump SQL file) to its Drizzle table object, for the full/database restore's coarse row-count preview. */
const SQL_TABLE_BY_NAME = new Map<string, PgTableWithColumns<any>>(Object.values(TABLE_MAP).map((t) => [getTableName(t as any), t]));

interface DownloadsFile {
  key: string;
  sizeBytes: number;
  updatedAt: string | null;
  contentBase64: string | null;
}

export interface RestorePreview {
  scope: BackupScope;
  backupId: number;
  backupCreatedAt: string;
  backupEnvironment: string;
  currentEnvironment: string;
  crossEnvironment: boolean;
  kind: "tables" | "downloads" | "sql";
  tableDiffs?: TableDiff[];
  downloadsDiff?: { willRestore: number; unchanged: number; totalInBackup: number };
  sqlSummary?: { table: string; backupRowCount: number; currentRowCount: number | null }[];
  warning?: string;
}

/** Read-only: computes what a restore of this backup WOULD change, without applying anything. */
export async function previewRestore(backupId: number): Promise<RestorePreview> {
  const backup = await getBackupOrThrow(backupId);
  const scope = backup.scope as BackupScope;
  const def = getBackupScopeDefinition(scope);
  if (!def) throw new Error(`Unknown backup scope: ${scope}`);
  const envelope = await loadEnvelope(backup.storagePath!);
  const currentEnvironment = getEnvironment();
  const crossEnvironment = backup.environment !== currentEnvironment;
  const base: Pick<RestorePreview, "scope" | "backupId" | "backupCreatedAt" | "backupEnvironment" | "currentEnvironment" | "crossEnvironment"> = {
    scope,
    backupId,
    backupCreatedAt: backup.createdAt.toISOString(),
    backupEnvironment: backup.environment,
    currentEnvironment,
    crossEnvironment,
  };

  if (def.type === "full" || def.type === "database") {
    const sqlDump = String((envelope as { sqlDump: string }).sqlDump ?? "");
    const sqlSummary = await summarizeSqlDump(sqlDump);
    return {
      ...base,
      kind: "sql",
      sqlSummary,
      warning:
        "Restoring the entire database replaces every table's contents in one transaction. This is a coarse, table-level estimate — exact row-level changes aren't computed for a full-database restore.",
    };
  }

  if (scope === "downloads") {
    const files = ((envelope as { tables: { files: DownloadsFile[] } }).tables.files) ?? [];
    const backend = await getStorageBackend();
    const currentObjects = await backend.listObjects();
    const currentByKey = new Map(currentObjects.map((o) => [o.key, o]));
    let willRestore = 0;
    let unchanged = 0;
    for (const f of files) {
      const current = currentByKey.get(f.key);
      if (!current || current.sizeBytes !== f.sizeBytes) willRestore++;
      else unchanged++;
    }
    return {
      ...base,
      kind: "downloads",
      downloadsDiff: { willRestore, unchanged, totalInBackup: files.length },
      warning: "Restoring downloads only re-creates missing/changed files from the backup — it never deletes files that exist now but aren't in the backup.",
    };
  }

  const tables = (envelope as { tables: Record<string, Record<string, unknown>[]> }).tables ?? {};
  const tableDiffs: TableDiff[] = [];
  for (const [tableName, rows] of Object.entries(tables)) {
    const table = TABLE_MAP[tableName];
    if (!table) continue;
    const diff = await diffTable(table, rows);
    tableDiffs.push({ ...diff, table: tableName });
  }
  return { ...base, kind: "tables", tableDiffs };
}

async function summarizeSqlDump(sqlDump: string): Promise<{ table: string; backupRowCount: number; currentRowCount: number | null }[]> {
  // pg_dump's default plain-text format uses COPY ... FROM stdin blocks for
  // data, not one INSERT per row — counting the lines inside each block is
  // the cheap way to get a per-table row count without executing anything.
  // Anchoring on a bare "\." *line* (not a literal "\n\\." two-char
  // sequence) matters: pg_dump emits "FROM stdin;\n\.\n" for an empty
  // table — only one newline separates "stdin;" from "\.". Requiring two
  // newlines made the old regex fail to match empty tables at all, so the
  // lazy capture group ran on into the *next* table's COPY block and
  // silently misattributed its row count. Counting "\n" inside the
  // captured body (which now always ends with the last row's own newline,
  // or is empty) gives the row count directly for both cases.
  const copyBlockRegex = /^COPY\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s*\([^)]*\)\s+FROM stdin;\n([\s\S]*?)\\\.$/gm;
  const summary: { table: string; backupRowCount: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = copyBlockRegex.exec(sqlDump)) !== null) {
    const table = match[1];
    const body = match[2];
    const rowCount = body === "" ? 0 : (body.match(/\n/g) ?? []).length;
    summary.push({ table, backupRowCount: rowCount });
  }
  const results: { table: string; backupRowCount: number; currentRowCount: number | null }[] = [];
  for (const s of summary) {
    const t = SQL_TABLE_BY_NAME.get(s.table);
    let currentRowCount: number | null = null;
    if (t) {
      try {
        currentRowCount = (await db.select().from(t as any)).length;
      } catch {
        currentRowCount = null;
      }
    }
    results.push({ ...s, currentRowCount });
  }
  return results;
}

function runPsqlRestore(sqlDump: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      reject(new Error("DATABASE_URL is not set."));
      return;
    }
    const child = execFile(
      "psql",
      ["--single-transaction", "-v", "ON_ERROR_STOP=1", databaseUrl],
      { maxBuffer: 1024 * 1024 * 512 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString().slice(0, 4000) || err.message));
          return;
        }
        resolve(stdout);
      },
    );
    child.stdin?.write(sqlDump);
    child.stdin?.end();
  });
}

export interface ExecuteRestoreOptions {
  backupId: number;
  actor?: StaffUser | undefined;
  confirmCrossEnvironment?: boolean;
  ipAddress?: string | null;
}

export interface RestoreOutcome {
  id: number;
  status: "completed" | "failed" | "blocked";
  error?: string;
  crossEnvironmentBlocked?: boolean;
  preRestoreBackupId?: number;
}

/**
 * Applies a restore: gates on the protected-dataset lock (Task 1), takes a
 * fresh safety backup of the same scope immediately before touching
 * anything (Task 3's engine), then replaces the current data with what's in
 * the backup. Every attempt gets a restores-table row and a protected-data
 * audit log entry, win or lose.
 */
export async function executeRestore(opts: ExecuteRestoreOptions): Promise<RestoreOutcome> {
  const backup = await getBackupOrThrow(opts.backupId);
  const scope = backup.scope as BackupScope;
  const datasetKeys = getScopeDatasets(scope);
  const currentEnvironment = getEnvironment();
  const crossEnvironment = backup.environment !== currentEnvironment;

  for (const k of datasetKeys) {
    await recordDatasetEvent({ datasetKey: k, action: "restore_requested", actor: opts.actor, ipAddress: opts.ipAddress, reason: `Restore requested from backup #${backup.id} (${scope})` });
  }

  if (crossEnvironment && !opts.confirmCrossEnvironment) {
    const [row] = await db
      .insert(restoresTable)
      .values({
        backupId: backup.id,
        scope,
        status: "blocked",
        crossEnvironment: backup.environment,
        errorMessage: `Backup was taken in "${backup.environment}" but this is "${currentEnvironment}". Cross-environment restore requires explicit confirmation.`,
        requestedByStaffId: opts.actor?.id ?? null,
        requestedByEmail: opts.actor?.email ?? null,
        completedAt: new Date(),
      })
      .returning();
    return { id: row.id, status: "blocked", error: row.errorMessage!, crossEnvironmentBlocked: true };
  }

  const lockedKeys: string[] = [];
  for (const k of datasetKeys) {
    if (!(await isDatasetUnlocked(k))) lockedKeys.push(k);
  }
  if (lockedKeys.length > 0) {
    for (const k of datasetKeys) {
      await recordDatasetEvent({ datasetKey: k, action: "blocked_attempt", actor: opts.actor, ipAddress: opts.ipAddress, reason: `Blocked restore from backup #${backup.id}` });
    }
    const labels = lockedKeys.map((k) => getDatasetDefinition(k)?.label ?? k).join(", ");
    const [row] = await db
      .insert(restoresTable)
      .values({
        backupId: backup.id,
        scope,
        status: "blocked",
        errorMessage: `Touches protected data (${labels}) that is still locked. Unlock it from the Protected Data centre first.`,
        requestedByStaffId: opts.actor?.id ?? null,
        requestedByEmail: opts.actor?.email ?? null,
        completedAt: new Date(),
      })
      .returning();
    return { id: row.id, status: "blocked", error: row.errorMessage! };
  }

  for (const k of datasetKeys) {
    await recordDatasetEvent({ datasetKey: k, action: "allowed_attempt", actor: opts.actor, ipAddress: opts.ipAddress, reason: `Allowed restore from backup #${backup.id}` });
  }

  const preview = await previewRestore(opts.backupId);
  const [row] = await db
    .insert(restoresTable)
    .values({
      backupId: backup.id,
      scope,
      status: "running",
      preview: preview as unknown as Record<string, unknown>,
      crossEnvironment: crossEnvironment ? backup.environment : null,
      requestedByStaffId: opts.actor?.id ?? null,
      requestedByEmail: opts.actor?.email ?? null,
    })
    .returning();

  let preRestoreBackupId: number | undefined;
  try {
    // Mandatory fresh backup immediately before the restore proceeds — the
    // one safety net if the restore itself turns out to be a mistake.
    const preRestore = await createBackup({ scope, trigger: `pre-restore-${backup.id}`, actor: opts.actor });
    preRestoreBackupId = preRestore.id;
    await db.update(restoresTable).set({ preRestoreBackupId }).where(eq(restoresTable.id, row.id));

    const envelope = await loadEnvelope(backup.storagePath!);
    let result: Record<string, unknown>;

    if (scope === "full" || scope === "database") {
      const sqlDump = String((envelope as { sqlDump: string }).sqlDump ?? "");
      if (!sqlDump) throw new Error("Backup has no SQL dump to restore from.");
      const output = await runPsqlRestore(sqlDump);
      result = { appliedVia: "psql --single-transaction", outputTail: output.slice(-2000) };
    } else if (scope === "downloads") {
      const files = ((envelope as { tables: { files: DownloadsFile[] } }).tables.files) ?? [];
      const backend = await getStorageBackend();
      let restored = 0;
      let skipped = 0;
      for (const f of files) {
        if (!f.contentBase64) {
          skipped++;
          continue;
        }
        await backend.putObject(f.key, Buffer.from(f.contentBase64, "base64"), { contentType: "application/octet-stream" });
        restored++;
      }
      result = { restored, skipped, totalInBackup: files.length };
    } else {
      const tables = (envelope as { tables: Record<string, Record<string, unknown>[]> }).tables ?? {};
      const tableResults: Record<string, { upserted: number; deleted: number }> = {};
      await db.transaction(async (tx) => {
        for (const [tableName, rows] of Object.entries(tables)) {
          const table = TABLE_MAP[tableName];
          if (!table) continue;
          tableResults[tableName] = await restoreTable(tx as unknown as typeof db, table, rows);
        }
      });
      result = { tables: tableResults };
    }

    await db.update(restoresTable).set({ status: "completed", result, completedAt: new Date() }).where(eq(restoresTable.id, row.id));
    for (const k of datasetKeys) {
      await recordDatasetEvent({ datasetKey: k, action: "restore_applied", actor: opts.actor, ipAddress: opts.ipAddress, reason: `Restored from backup #${backup.id} (${scope})` });
    }
    logger.info({ restoreId: row.id, backupId: backup.id, scope }, "Restore completed");
    return { id: row.id, status: "completed", preRestoreBackupId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(restoresTable).set({ status: "failed", errorMessage: message, completedAt: new Date() }).where(eq(restoresTable.id, row.id));
    for (const k of datasetKeys) {
      await recordDatasetEvent({ datasetKey: k, action: "restore_failed", actor: opts.actor, ipAddress: opts.ipAddress, reason: `Restore from backup #${backup.id} failed: ${message}` });
    }
    logger.error({ err, restoreId: row.id, backupId: backup.id, scope }, "Restore failed");
    return { id: row.id, status: "failed", error: message, preRestoreBackupId };
  }
}

export async function listRestorableBackups() {
  const rows = await db.select().from(backupsTable).where(eq(backupsTable.status, "completed")).orderBy(desc(backupsTable.createdAt)).limit(200);
  return rows;
}

export async function listRestores() {
  return db.select().from(restoresTable).orderBy(desc(restoresTable.createdAt)).limit(200);
}

export async function getRestore(id: number) {
  const [row] = await db.select().from(restoresTable).where(eq(restoresTable.id, id));
  return row;
}
