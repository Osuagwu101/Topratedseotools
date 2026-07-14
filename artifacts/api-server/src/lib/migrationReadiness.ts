import {
  db,
  productsTable,
  toolServersTable,
  toolAssignmentsTable,
  ordersTable,
  orderAttributionsTable,
  toolEntitlementsTable,
  userDeviceSessionsTable,
  userDailyUsageTable,
  staffUsersTable,
  couponsTable,
  couponRedemptionsTable,
  referralSettingsTable,
  referralCodesTable,
  referralsTable,
  userCreditsTable,
  creditTransactionsTable,
  seoGeneratorSettingsTable,
  emailSettingsTable,
  paymentSettingsTable,
  paymentMethodsTable,
  siteSettingsTable,
  featureFlagsTable,
  analyticsSettingsTable,
  conversionEventsTable,
  reviewsTable,
  testimonialsTable,
  blogPostsTable,
  backupsTable,
  restoresTable,
  configAuditLogTable,
  integrityAuditLogTable,
  protectedDataUnlockLogTable,
  protectedDatasetsTable,
} from "@workspace/db";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { getStorageBackend } from "./storage";
import { getEnvironment } from "./environment";
import { getBackupScopeDefinition } from "./backupEngine";
import { previewRestore, getScopeDatasets, type RestorePreview } from "./restoreEngine";

async function count(table: PgTableWithColumns<any>): Promise<number> {
  const rows = await db.select().from(table as any);
  return rows.length;
}

export type StorageMedium = "postgres" | "object-storage" | "external-saas";

export interface MigrationCategory {
  key: string;
  label: string;
  description: string;
  medium: StorageMedium;
  /** Recorded count of rows/objects backing this category, purely informational. */
  recordCount: number;
  /** Whether this category is portable to a Hostinger-style plain VPS today, given current configuration. */
  portable: boolean;
  /** Human-readable blocker if not portable, or a caveat even when portable. Null when there is nothing to flag. */
  note: string | null;
}

export interface MigrationReadinessReport {
  environment: string;
  generatedAt: string;
  storageBackend: string;
  categories: MigrationCategory[];
  overallPortable: boolean;
  summary: string;
}

/**
 * Enumerates every category of business data this app owns and reports
 * whether it is portable to a plain Postgres + disk host (e.g. Hostinger)
 * today. This does not move any data — it is read-only reconnaissance,
 * built on top of the storage-backend abstraction (Task: Hostinger
 * portability) and the existing schema, not a replacement for either.
 */
export async function getMigrationReadinessReport(): Promise<MigrationReadinessReport> {
  const backend = await getStorageBackend();
  let objectCount = 0;
  let objectBytes = 0;
  let storageError: string | null = null;
  try {
    const objects = await backend.listObjects();
    objectCount = objects.length;
    objectBytes = objects.reduce((sum, o) => sum + o.sizeBytes, 0);
  } catch (err) {
    storageError = err instanceof Error ? err.message : "Could not list storage objects.";
  }

  const storagePortability: Record<string, { portable: boolean; note: string | null }> = {
    replit: {
      portable: false,
      note: 'Files live in Replit\'s managed Object Storage (via PUBLIC_OBJECT_SEARCH_PATHS). Switch Storage Manager to "s3" or "local" and move the files before leaving Replit — see the "Confirm the S3-compatible storage option actually works" task for verifying the S3 path end-to-end.',
    },
    s3: { portable: true, note: "Any S3-compatible bucket works from any host, including one reachable from Hostinger." },
    local: { portable: true, note: "Files live on this server's own disk under the configured directory — moves with a full disk/volume copy during migration." },
  };
  const settings = await (await import("./storage")).getStorageSettings();
  const storageInfo = storagePortability[settings.backend] ?? { portable: false, note: "Unknown storage backend." };

  const [
    productsCount,
    toolServersCount,
    toolAssignmentsCount,
    ordersCount,
    orderAttributionsCount,
    entitlementsCount,
    deviceSessionsCount,
    dailyUsageCount,
    staffCount,
    couponsCount,
    couponRedemptionsCount,
    referralsCount,
    referralCodesCount,
    userCreditsCount,
    creditTxCount,
    aiSettingsCount,
    emailSettingsCount,
    paymentSettingsCount,
    paymentMethodsCount,
    siteSettingsCount,
    featureFlagsCount,
    analyticsSettingsCount,
    conversionEventsCount,
    reviewsCount,
    testimonialsCount,
    blogPostsCount,
    backupsCount,
    restoresCount,
    auditLogCount,
  ] = await Promise.all([
    count(productsTable),
    count(toolServersTable),
    count(toolAssignmentsTable),
    count(ordersTable),
    count(orderAttributionsTable),
    count(toolEntitlementsTable),
    count(userDeviceSessionsTable),
    count(userDailyUsageTable),
    count(staffUsersTable),
    count(couponsTable),
    count(couponRedemptionsTable),
    count(referralsTable),
    count(referralCodesTable),
    count(userCreditsTable),
    count(creditTransactionsTable),
    count(seoGeneratorSettingsTable),
    count(emailSettingsTable),
    count(paymentSettingsTable),
    count(paymentMethodsTable),
    count(siteSettingsTable),
    count(featureFlagsTable),
    count(analyticsSettingsTable),
    count(conversionEventsTable),
    count(reviewsTable),
    count(testimonialsTable),
    count(blogPostsTable),
    count(backupsTable),
    count(restoresTable),
    Promise.all([count(configAuditLogTable), count(integrityAuditLogTable), count(protectedDataUnlockLogTable), count(protectedDatasetsTable)]).then((r) => r.reduce((a, b) => a + b, 0)),
  ]);

  const categories: MigrationCategory[] = [
    {
      key: "products",
      label: "Products & Catalog",
      description: "Product catalog, tool servers, and tool assignments.",
      medium: "postgres",
      recordCount: productsCount + toolServersCount + toolAssignmentsCount,
      portable: true,
      note: null,
    },
    {
      key: "images_uploads_downloads",
      label: "Images, Uploads & Downloads",
      description: "Product images, blog media, logos, and customer-downloadable files.",
      medium: "object-storage",
      recordCount: objectCount,
      portable: storageInfo.portable && !storageError,
      note: storageError ? `Could not verify current storage backend: ${storageError}` : `${storageInfo.note} Backend currently active: "${settings.backend}". Total bytes: ${objectBytes.toLocaleString()}.`,
    },
    {
      key: "users",
      label: "Customer Accounts",
      description: "Customer identity and login (email, password/social sign-in) plus locally-mirrored device sessions and daily usage.",
      medium: "external-saas",
      recordCount: deviceSessionsCount + dailyUsageCount,
      portable: true,
      note: "Customer identity itself lives in Clerk (a hosted, host-agnostic service), not in this app's database — moving hosts only requires re-pointing this app's Clerk environment variables (CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, etc.) at the new host, not migrating customer records. Device sessions and daily usage are local Postgres rows and move with a normal database export.",
    },
    {
      key: "staff_admin_accounts",
      label: "Staff / Admin Accounts",
      description: "Super Admin and staff login credentials for this dashboard.",
      medium: "postgres",
      recordCount: staffCount,
      portable: true,
      note: null,
    },
    {
      key: "orders",
      label: "Orders",
      description: "Order records and their marketing attribution.",
      medium: "postgres",
      recordCount: ordersCount + orderAttributionsCount,
      portable: true,
      note: null,
    },
    {
      key: "payment_history",
      label: "Payment History",
      description: "Payment/transaction status, amounts, and gateway reference per order.",
      medium: "postgres",
      recordCount: ordersCount,
      portable: true,
      note: "This app has no separate payment-ledger table — transaction status, amount, and the gateway reference live as columns on the orders table itself, so backing up/restoring orders already covers payment history.",
    },
    {
      key: "subscriptions_purchases",
      label: "Subscriptions & Purchases (Entitlements)",
      description: "What each customer currently has access to and for how long.",
      medium: "postgres",
      recordCount: entitlementsCount,
      portable: true,
      note: null,
    },
    {
      key: "coupons",
      label: "Coupons",
      description: "Discount codes and their redemption history.",
      medium: "postgres",
      recordCount: couponsCount + couponRedemptionsCount,
      portable: true,
      note: null,
    },
    {
      key: "referral_data",
      label: "Referral Program",
      description: "Referral signups, rewards, and store-credit ledger.",
      medium: "postgres",
      recordCount: referralsCount + referralCodesCount + userCreditsCount + creditTxCount,
      portable: true,
      note: null,
    },
    {
      key: "ai_settings",
      label: "AI Configuration",
      description: "AI content generator (SEO Generator) settings, keys, and generation history.",
      medium: "postgres",
      recordCount: aiSettingsCount,
      portable: true,
      note: "Configuration rows are portable; any AI provider API key referenced from the System Configuration Centre must still be valid/reachable from the new host (no Replit-specific dependency).",
    },
    {
      key: "email_settings",
      label: "Email Configuration",
      description: "Transactional email provider configuration.",
      medium: "postgres",
      recordCount: emailSettingsCount,
      portable: true,
      note: null,
    },
    {
      key: "payment_settings",
      label: "Payment Configuration",
      description: "Payment gateway configuration and available payment methods.",
      medium: "postgres",
      recordCount: paymentSettingsCount + paymentMethodsCount,
      portable: true,
      note: null,
    },
    {
      key: "website_settings",
      label: "Website & Content Settings",
      description: "Site settings, feature flags, blog posts, reviews, and testimonials.",
      medium: "postgres",
      recordCount: siteSettingsCount + featureFlagsCount + blogPostsCount + reviewsCount + testimonialsCount,
      portable: true,
      note: null,
    },
    {
      key: "analytics",
      label: "Analytics",
      description: "Analytics/tracking configuration and recorded conversion events.",
      medium: "postgres",
      recordCount: analyticsSettingsCount + conversionEventsCount,
      portable: true,
      note: null,
    },
    {
      key: "audit_system_logs",
      label: "Audit & System Logs",
      description: "Backup/restore history and the admin-tooling audit trails (config changes, integrity checks, protected-data unlocks, recovery actions). Operational metadata, not customer data.",
      medium: "postgres",
      recordCount: backupsCount + restoresCount + auditLogCount,
      portable: true,
      note: null,
    },
  ];

  const overallPortable = categories.every((c) => c.portable);
  const blockers = categories.filter((c) => !c.portable);
  const summary = overallPortable
    ? "Every business-data category is portable to a plain Postgres + disk host (e.g. Hostinger) with no code changes — only configuration (env vars, storage backend selection) needs to move."
    : `${blockers.length} categor${blockers.length === 1 ? "y is" : "ies are"} not yet portable: ${blockers.map((b) => b.label).join(", ")}. Resolve these before migrating off Replit.`;

  return {
    environment: getEnvironment(),
    generatedAt: new Date().toISOString(),
    storageBackend: settings.backend,
    categories,
    overallPortable,
    summary,
  };
}

// ── Migration validation (compare a backup snapshot against the live DB) ──

/** Maps the table-name keys used in previewRestore's tableDiffs / a partial backup envelope, and the raw Postgres table names used in a full/database backup's SQL dump, to the same business categories reported above. */
const CATEGORY_BY_TABLE_KEY: Record<string, string> = {
  // camelCase keys (partial-scope backup envelopes / TABLE_MAP)
  products: "products",
  toolServers: "products",
  toolAssignments: "products",
  orders: "orders",
  orderAttributions: "orders",
  userDeviceSessions: "users",
  userDailyUsage: "users",
  toolEntitlements: "subscriptions_purchases",
  siteSettings: "website_settings",
  paymentSettings: "payment_settings",
  emailSettings: "email_settings",
  featureFlags: "website_settings",
  analyticsSettings: "analytics",
  storageSettings: "images_uploads_downloads",
  systemConfig: "payment_settings",
  aiSettings: "ai_settings",
  // snake_case Postgres table names (full/database backup SQL dump)
  tool_servers: "products",
  tool_assignments: "products",
  order_attributions: "orders",
  user_device_sessions: "users",
  user_daily_usage: "users",
  tool_entitlements: "subscriptions_purchases",
  site_settings: "website_settings",
  payment_settings: "payment_settings",
  email_settings: "email_settings",
  feature_flags: "website_settings",
  analytics_settings: "analytics",
  storage_settings: "images_uploads_downloads",
  system_config: "payment_settings",
  seo_generator_settings: "ai_settings",
  staff_users: "staff_admin_accounts",
  staff_sessions: "staff_admin_accounts",
  coupons: "coupons",
  coupon_redemptions: "coupons",
  referral_settings: "referral_data",
  referral_codes: "referral_data",
  referrals: "referral_data",
  user_credits: "referral_data",
  credit_transactions: "referral_data",
  conversion_events: "analytics",
  reviews: "website_settings",
  testimonials: "website_settings",
  blog_posts: "website_settings",
  payment_methods: "payment_settings",
  // Blog/content sub-tables and homepage content — all part of Website & Content Settings.
  blog_categories: "website_settings",
  blog_tags: "website_settings",
  blog_post_tags: "website_settings",
  blog_media: "website_settings",
  blog_redirects: "website_settings",
  blog_comments: "website_settings",
  blog_settings: "website_settings",
  newsletter_subscribers: "website_settings",
  benefit_cards: "website_settings",
  how_it_works_steps: "website_settings",
  faq_items: "website_settings",
  review_prompts: "website_settings",
  customer_counter_audit: "website_settings",
  // AI content-generation pipeline sub-tables — all part of AI Configuration.
  keyword_research_sessions: "ai_settings",
  keyword_research_items: "ai_settings",
  content_briefs: "ai_settings",
  generation_jobs: "ai_settings",
  post_section_versions: "ai_settings",
  seo_quality_reports: "ai_settings",
  banned_phrases: "ai_settings",
  generation_usage_log: "ai_settings",
  seo_link_insights: "ai_settings",
  // Operational metadata about this app's own admin tooling — not customer
  // business data, but still real rows worth accounting for explicitly
  // rather than leaving them in an unlabeled bucket.
  backups: "audit_system_logs",
  restores: "audit_system_logs",
  config_audit_log: "audit_system_logs",
  integrity_audit_log: "audit_system_logs",
  customer_recovery_log: "audit_system_logs",
  payment_recovery_log: "audit_system_logs",
  product_recovery_log: "audit_system_logs",
  protected_data_unlock_log: "audit_system_logs",
  protected_datasets: "audit_system_logs",
};

function categoryLabel(key: string): string {
  const labels: Record<string, string> = {
    products: "Products & Catalog",
    images_uploads_downloads: "Images, Uploads & Downloads",
    users: "Customer Accounts",
    staff_admin_accounts: "Staff / Admin Accounts",
    orders: "Orders",
    payment_history: "Payment History",
    subscriptions_purchases: "Subscriptions & Purchases (Entitlements)",
    coupons: "Coupons",
    referral_data: "Referral Program",
    ai_settings: "AI Configuration",
    email_settings: "Email Configuration",
    payment_settings: "Payment Configuration",
    website_settings: "Website & Content Settings",
    analytics: "Analytics",
    audit_system_logs: "Audit & System Logs",
    uncategorized: "Other",
  };
  return labels[key] ?? key;
}

export interface CategoryValidationResult {
  categoryKey: string;
  categoryLabel: string;
  status: "match" | "mismatch" | "unknown";
  detail: string;
  tables: string[];
}

export interface MigrationValidationReport {
  backupId: number;
  backupScope: string;
  backupCreatedAt: string;
  crossEnvironment: boolean;
  checkedAt: string;
  categories: CategoryValidationResult[];
  /**
   * "match" only when every category was actually checked and matched.
   * "mismatch" when at least one category differs. "inconclusive" when
   * nothing mismatched but at least one category could not be checked
   * (its live count wasn't available) — this must never be reported to an
   * admin as a pass, since unchecked data could just as easily be wrong.
   */
  overallStatus: "match" | "mismatch" | "inconclusive";
  warning?: string;
}

/**
 * Validates a backup snapshot against the live database, grouped by business
 * category rather than raw table name, using the same per-row/per-table diff
 * engine the Restore Centre already uses for restore previews (Task 3/4) —
 * this is deliberately not a second diff implementation, just a relabeling
 * of previewRestore's output for a "did the migration lose anything?"
 * reading rather than a "what would restoring change?" reading.
 */
export async function validateMigrationAgainstBackup(backupId: number): Promise<MigrationValidationReport> {
  const preview: RestorePreview = await previewRestore(backupId);
  const grouped = new Map<string, CategoryValidationResult>();

  function ensure(key: string): CategoryValidationResult {
    const catKey = CATEGORY_BY_TABLE_KEY[key] ?? "uncategorized";
    let entry = grouped.get(catKey);
    if (!entry) {
      entry = { categoryKey: catKey, categoryLabel: categoryLabel(catKey), status: "match", detail: "", tables: [] };
      grouped.set(catKey, entry);
    }
    return entry;
  }

  if (preview.kind === "tables" && preview.tableDiffs) {
    for (const diff of preview.tableDiffs) {
      const entry = ensure(diff.table);
      entry.tables.push(diff.table);
      const mismatchCount = diff.added + diff.changed + diff.removed;
      if (mismatchCount > 0) {
        entry.status = "mismatch";
        entry.detail += `${entry.detail ? "; " : ""}${diff.table}: ${diff.backupCount} in backup vs ${diff.currentCount} now (${diff.added} missing now, ${diff.changed} changed, ${diff.removed} added since backup)`;
      } else {
        entry.detail += `${entry.detail ? "; " : ""}${diff.table}: ${diff.currentCount} rows, all match`;
      }
    }
  } else if (preview.kind === "downloads" && preview.downloadsDiff) {
    const entry = ensure("storageSettings");
    entry.tables.push("storage objects");
    const { willRestore, unchanged, totalInBackup } = preview.downloadsDiff;
    if (willRestore > 0) {
      entry.status = "mismatch";
      entry.detail = `${willRestore} of ${totalInBackup} files differ or are missing from live storage (${unchanged} unchanged).`;
    } else {
      entry.detail = `All ${totalInBackup} files in the backup match live storage.`;
    }
  } else if (preview.kind === "sql" && preview.sqlSummary) {
    for (const s of preview.sqlSummary) {
      const entry = ensure(s.table);
      entry.tables.push(s.table);
      if (s.currentRowCount === null) {
        entry.detail += `${entry.detail ? "; " : ""}${s.table}: ${s.backupRowCount} rows in backup, live count not checked`;
        if (entry.status === "match") entry.status = "unknown";
      } else if (s.currentRowCount !== s.backupRowCount) {
        entry.status = "mismatch";
        entry.detail += `${entry.detail ? "; " : ""}${s.table}: ${s.backupRowCount} rows in backup vs ${s.currentRowCount} now`;
      } else {
        entry.detail += `${entry.detail ? "; " : ""}${s.table}: ${s.currentRowCount} rows, count matches`;
      }
    }
  }

  const categories = Array.from(grouped.values()).sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel));
  const overallStatus: "match" | "mismatch" | "inconclusive" = categories.some((c) => c.status === "mismatch")
    ? "mismatch"
    : categories.some((c) => c.status === "unknown")
      ? "inconclusive"
      : "match";

  return {
    backupId: preview.backupId,
    backupScope: preview.scope,
    backupCreatedAt: preview.backupCreatedAt,
    crossEnvironment: preview.crossEnvironment,
    checkedAt: new Date().toISOString(),
    categories,
    overallStatus,
    warning: preview.warning,
  };
}

export { getScopeDatasets, getBackupScopeDefinition };
