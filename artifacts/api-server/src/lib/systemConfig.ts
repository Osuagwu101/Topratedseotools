import { db, systemConfigTable, configAuditLogTable, type StaffUser } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { encryptSecret, decryptSecret, maskSecret } from "./secretsVault";
import { logger } from "./logger";
import { getOpenAIClient } from "./openaiClient";
import { getGeminiClient } from "./geminiClient";

export type ConfigCategory = "payment" | "ai" | "auth" | "email" | "infrastructure";

export interface ConfigDefinition {
  key: string;
  label: string;
  category: ConfigCategory;
  description: string;
  /** Env var(s) this key falls back to when no DB override is stored. Usually just [key]. */
  envFallbackKeys?: string[];
  testConnection?: () => Promise<{ ok: boolean; message: string }>;
  /** Cannot be cleared back to "unset" from the UI (would break the app). */
  required?: boolean;
  /**
   * Never stored in the DB-backed vault, only ever read from process.env —
   * the UI can display its status but cannot set or clear it. Required for
   * ENCRYPTION_KEY specifically: that key encrypts every row in this same
   * table, so storing it *in* the table it protects is circular — a
   * rotation would leave old rows encrypted under the previous key while
   * new decrypts use the new one, and a restart would need the DB-stored
   * key decrypted before it could be read, which is impossible without an
   * external source. Keep it environment/Secrets-only.
   */
  envOnly?: boolean;
}

async function testPaystackKey(key: string | null): Promise<{ ok: boolean; message: string }> {
  if (!key) return { ok: false, message: "No Paystack secret key configured." };
  try {
    const res = await fetch("https://api.paystack.co/transaction/totals", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string };
    if (res.ok && body.status) return { ok: true, message: "Paystack accepted the key." };
    return { ok: false, message: body.message || `Paystack rejected the key (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

async function testPaystackLiveConnection(): Promise<{ ok: boolean; message: string }> {
  const key = (await getConfigValue("PAYSTACK_SECRET_KEY")) || process.env.PAYSTACK_API_KEY || null;
  return testPaystackKey(key);
}

async function testPaystackTestConnection(): Promise<{ ok: boolean; message: string }> {
  const key = (await getConfigValue("PAYSTACK_TEST_SECRET_KEY")) || null;
  return testPaystackKey(key);
}

async function testOpenAIConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getOpenAIClient();
    await client.models.list();
    return { ok: true, message: "OpenAI accepted the key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}

async function testGeminiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getGeminiClient();
    await client.models.list();
    return { ok: true, message: "Gemini accepted the key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Gemini." };
  }
}

async function testResendConnection(): Promise<{ ok: boolean; message: string }> {
  const key = await getConfigValue("RESEND_API_KEY");
  if (!key) return { ok: false, message: "No Resend API key configured." };
  try {
    const { Resend } = await import("resend");
    const client = new Resend(key);
    const { error } = await client.apiKeys.list();
    if (error) return { ok: false, message: error.message || "Resend rejected the key." };
    return { ok: true, message: "Resend accepted the key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Resend." };
  }
}

export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  {
    key: "PAYSTACK_SECRET_KEY",
    label: "Paystack Secret Key (Live)",
    category: "payment",
    description: "Server-side key used to initialize and verify Paystack transactions for checkout in Live mode.",
    envFallbackKeys: ["PAYSTACK_SECRET_KEY", "PAYSTACK_API_KEY"],
    testConnection: testPaystackLiveConnection,
  },
  {
    key: "PAYSTACK_TEST_SECRET_KEY",
    label: "Paystack Secret Key (Test)",
    category: "payment",
    description:
      "Server-side key used instead of the live key when Test Mode is enabled in the Payment Management Centre.",
    testConnection: testPaystackTestConnection,
  },
  {
    key: "CLERK_SECRET_KEY",
    label: "Clerk Secret Key",
    category: "auth",
    description: "Server-side key for Clerk (customer sign-in). Also used by the Clerk Frontend API proxy.",
  },
  {
    key: "CLERK_PUBLISHABLE_KEY",
    label: "Clerk Publishable Key",
    category: "auth",
    description: "Public Clerk key shared with the storefront frontend.",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API Key",
    category: "ai",
    description: "Used by the AI SEO Article Generator when OpenAI is selected as the provider.",
    testConnection: testOpenAIConnection,
  },
  {
    key: "GEMINI_API_KEY",
    label: "Gemini API Key",
    category: "ai",
    description: "Used by the AI SEO Article Generator when Gemini is selected as the provider.",
    testConnection: testGeminiConnection,
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    category: "email",
    description: "Transactional email sending. Configure sender address/templates in the Email Configuration Centre.",
    testConnection: testResendConnection,
  },
  {
    key: "SESSION_SECRET",
    label: "Session Secret",
    category: "infrastructure",
    description:
      "Signs session cookies and derives the analytics-token encryption key. Required at startup — the server " +
      "refuses to boot without it, so it has no insecure default here.",
    required: true,
  },
  {
    key: "ENCRYPTION_KEY",
    label: "System Config Encryption Key",
    category: "infrastructure",
    description:
      "Dedicated key used to encrypt every secret stored in this System Configuration Centre. If unset, secrets " +
      "are encrypted with a temporary key that is lost on every restart. Must be set via Replit Secrets — it " +
      "cannot be managed here, since it is what encrypts everything else in this table.",
    required: true,
    envOnly: true,
  },
];

const definitionsByKey = new Map(CONFIG_DEFINITIONS.map((d) => [d.key, d]));

export function getConfigDefinition(key: string): ConfigDefinition | undefined {
  return definitionsByKey.get(key);
}

// ── Live process.env mirroring ──────────────────────────────────────────
// Consumers throughout the codebase (paystack.ts, clerkProxyMiddleware.ts,
// openaiClient.ts, ...) read straight from `process.env` for simplicity and
// to avoid a wider refactor. To make admin-managed overrides actually take
// effect — both at boot and immediately when an admin sets/clears a value
// from the UI, with no restart required — every write here also mirrors
// into `process.env` right away. `envBaseline` remembers each key's real
// startup env value (captured once, before any override is ever applied) so
// clearing a DB override can restore the original environment value instead
// of just deleting it.
let envBaselineCaptured = false;
const envBaseline = new Map<string, string | undefined>();

function captureEnvBaselineOnce(): void {
  if (envBaselineCaptured) return;
  envBaselineCaptured = true;
  for (const def of CONFIG_DEFINITIONS) {
    envBaseline.set(def.key, process.env[def.key]);
  }
}

function applyLiveOverride(key: string, value: string): void {
  captureEnvBaselineOnce();
  process.env[key] = value;
}

function revertLiveOverride(key: string): void {
  captureEnvBaselineOnce();
  const original = envBaseline.get(key);
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

async function readRow(key: string) {
  const [row] = await db.select().from(systemConfigTable).where(eq(systemConfigTable.key, key)).limit(1);
  return row ?? null;
}

/** Live value: DB override (decrypted) if present, else the environment fallback. */
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const row = await readRow(key);
    if (row?.valueEncrypted) {
      try {
        return decryptSecret(row.valueEncrypted);
      } catch (err) {
        logger.error({ err, key }, "Failed to decrypt stored config value; falling back to environment");
      }
    }
  } catch (err) {
    logger.error({ err, key }, "Failed to read system_config row; falling back to environment");
  }
  const def = getConfigDefinition(key);
  for (const envKey of def?.envFallbackKeys ?? [key]) {
    const v = process.env[envKey];
    if (v) return v;
  }
  return null;
}

export interface ConfigStatus {
  key: string;
  label: string;
  category: ConfigCategory;
  description: string;
  required: boolean;
  envOnly: boolean;
  source: "database" | "environment" | "unset";
  masked: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
  hasTest: boolean;
}

export async function listConfigStatuses(): Promise<ConfigStatus[]> {
  const rows = await db.select().from(systemConfigTable);
  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  return Promise.all(
    CONFIG_DEFINITIONS.map(async (def) => {
      // envOnly keys (ENCRYPTION_KEY) are never read from the DB, even if a
      // stray row exists from before this restriction — decrypting it would
      // use the *current* key, which for ENCRYPTION_KEY is meaningless.
      const row = def.envOnly ? undefined : rowByKey.get(def.key);
      let source: ConfigStatus["source"] = "unset";
      let masked: string | null = null;

      if (row?.valueEncrypted) {
        try {
          masked = maskSecret(decryptSecret(row.valueEncrypted));
          source = "database";
        } catch {
          masked = null;
          source = "unset";
        }
      } else {
        for (const envKey of def.envFallbackKeys ?? [def.key]) {
          const v = process.env[envKey];
          if (v) {
            masked = maskSecret(v);
            source = "environment";
            break;
          }
        }
      }

      return {
        key: def.key,
        label: def.label,
        category: def.category,
        description: def.description,
        required: !!def.required,
        envOnly: !!def.envOnly,
        source,
        masked,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        updatedByEmail: row?.updatedByEmail ?? null,
        hasTest: !!def.testConnection,
      };
    }),
  );
}

async function writeAuditLog(entry: {
  configKey: string;
  action: string;
  actor: StaffUser | undefined;
  detail: string;
  ipAddress?: string | null;
}): Promise<void> {
  await db.insert(configAuditLogTable).values({
    configKey: entry.configKey,
    action: entry.action,
    staffUserId: entry.actor?.id ?? null,
    staffEmail: entry.actor?.email ?? null,
    staffName: entry.actor?.name ?? null,
    detail: entry.detail,
    ipAddress: entry.ipAddress ?? null,
  });
}

export async function setConfigValue(
  key: string,
  value: string,
  actor: StaffUser | undefined,
  ipAddress?: string | null,
): Promise<void> {
  const def = getConfigDefinition(key);
  if (!def) throw new Error(`Unknown configuration key: ${key}`);
  if (def.envOnly) {
    throw new Error(`${def.label} cannot be managed here — set it via Replit Secrets instead.`);
  }
  const existing = await readRow(key);
  const encrypted = encryptSecret(value);
  const now = new Date();
  await db
    .insert(systemConfigTable)
    .values({
      key,
      valueEncrypted: encrypted,
      updatedAt: now,
      updatedByStaffId: actor?.id ?? null,
      updatedByEmail: actor?.email ?? null,
    })
    .onConflictDoUpdate({
      target: systemConfigTable.key,
      set: { valueEncrypted: encrypted, updatedAt: now, updatedByStaffId: actor?.id ?? null, updatedByEmail: actor?.email ?? null },
    });
  applyLiveOverride(key, value);
  await writeAuditLog({
    configKey: key,
    action: existing ? "updated" : "created",
    actor,
    detail: `${existing ? "Updated" : "Set"} ${def.label}`,
    ipAddress,
  });
}

export async function clearConfigValue(key: string, actor: StaffUser | undefined, ipAddress?: string | null): Promise<void> {
  const def = getConfigDefinition(key);
  if (!def) throw new Error(`Unknown configuration key: ${key}`);
  if (def.envOnly) {
    throw new Error(`${def.label} cannot be managed here — set it via Replit Secrets instead.`);
  }
  await db.delete(systemConfigTable).where(eq(systemConfigTable.key, key));
  revertLiveOverride(key);
  await writeAuditLog({
    configKey: key,
    action: "cleared",
    actor,
    detail: `Cleared ${def.label} (reverted to environment variable, if any)`,
    ipAddress,
  });
}

export async function testConfigConnection(
  key: string,
  actor: StaffUser | undefined,
  ipAddress?: string | null,
): Promise<{ ok: boolean; message: string }> {
  const def = getConfigDefinition(key);
  if (!def) throw new Error(`Unknown configuration key: ${key}`);
  if (!def.testConnection) return { ok: false, message: "No connection test is available for this credential." };
  const result = await def.testConnection();
  await writeAuditLog({
    configKey: key,
    action: "test_connection",
    actor,
    detail: `Tested ${def.label}: ${result.ok ? "success" : "failed"}`,
    ipAddress,
  });
  return result;
}

export async function listAuditLog(limit = 200) {
  return db.select().from(configAuditLogTable).orderBy(desc(configAuditLogTable.createdAt)).limit(limit);
}

/**
 * Populates process.env from any DB-stored overrides for every registered
 * key. Existing consumers (paystack.ts, openaiClient.ts, geminiClient.ts,
 * clerkProxyMiddleware.ts, app.ts) read straight from process.env and need
 * no code changes to pick up admin-configured values; a DB override always
 * wins over whatever was in the environment at boot. Must be called (and
 * awaited) before `./app` is imported — modules that capture an env value at
 * import/construction time (e.g. the Clerk proxy factory) would otherwise
 * freeze on the pre-hydration value. Consumers that read process.env at
 * request time instead (paystack.ts, the Clerk proxy's per-request checks)
 * additionally benefit from setConfigValue()/clearConfigValue() mirroring
 * live changes into process.env with no restart required.
 */
export async function hydrateProcessEnvFromConfig(): Promise<void> {
  captureEnvBaselineOnce();
  const rows = await db.select().from(systemConfigTable);
  for (const row of rows) {
    if (!row.valueEncrypted) continue;
    // Never hydrate an envOnly key (ENCRYPTION_KEY) from a DB row, even a
    // stray one left over from before this restriction existed — it must
    // only ever come from the real environment.
    if (getConfigDefinition(row.key)?.envOnly) continue;
    try {
      const value = decryptSecret(row.valueEncrypted);
      process.env[row.key] = value;
    } catch (err) {
      logger.error({ err, key: row.key }, "Failed to decrypt stored config value during startup hydration");
    }
  }
}
