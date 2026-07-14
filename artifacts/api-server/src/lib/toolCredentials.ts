/**
 * Encrypt-at-rest helpers for tool_servers.username/password — the shared
 * login credentials for the third-party tools this app proxies customers
 * into. Reuses the same AES-256-GCM vault as the System Configuration
 * Centre (secretsVault.ts), but under its own label so the two stores'
 * ciphertexts are independent.
 *
 * Every read/write path for these two columns should go through this file
 * rather than touching them (or encryptToolCredential/decryptToolCredential)
 * directly, so masking and legacy-plaintext handling stay consistent.
 */

import { db, toolServersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptToolCredential, decryptToolCredential, isEncryptedValue, maskSecret } from "./secretsVault";
import { logger } from "./logger";

/** Encrypts a credential value for storage. Leaves null/empty untouched. */
export function encryptToolField(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return value ?? null;
  return encryptToolCredential(value);
}

/**
 * Decrypts a stored credential value. Values that don't look like our
 * ciphertext format are treated as not-yet-migrated legacy plaintext and
 * returned as-is (the boot-time migration below is what normally clears
 * these out, but this keeps every read path safe even before/if it hasn't
 * run). Returns null (rather than throwing) if decryption fails, since a
 * corrupt/foreign-key credential shouldn't take down a request.
 */
export function decryptToolField(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return value ?? null;
  if (!isEncryptedValue(value)) return value;
  try {
    return decryptToolCredential(value);
  } catch (err) {
    logger.error({ err }, "Failed to decrypt tool_servers credential");
    return null;
  }
}

/** Masked view of a stored credential value, safe to include in any API response. */
export function maskToolField(value: string | null | undefined): string | null {
  const plain = decryptToolField(value);
  return plain ? maskSecret(plain) : null;
}

type ServerCreds = { username: string | null; password: string | null };

/** Decrypts username/password on a tool_servers row for internal use (login flows). */
export function decryptServerCredentials<T extends ServerCreds>(server: T): T {
  return { ...server, username: decryptToolField(server.username), password: decryptToolField(server.password) };
}

/**
 * Masked view of a tool_servers row's username/password for admin API
 * responses — never returns plaintext. `hasUsername`/`hasPassword` let the
 * admin UI validate "credentials are configured" without seeing them.
 */
export function maskServerCredentials<T extends ServerCreds>(
  server: T,
): T & { hasUsername: boolean; hasPassword: boolean } {
  return {
    ...server,
    username: maskToolField(server.username),
    password: maskToolField(server.password),
    hasUsername: !!server.username,
    hasPassword: !!server.password,
  };
}

/**
 * A field value submitted back from the admin UI that is exactly a masked
 * placeholder (starts with the mask bullet) means "unchanged" — the admin
 * never saw the real value, so we must not encrypt the placeholder itself
 * over the top of the real stored credential.
 */
export function isUnchangedMaskedValue(value: string): boolean {
  return value.startsWith("•");
}

/**
 * One-time boot migration: encrypts any tool_servers.username/password
 * values still stored in plaintext (rows created before this feature
 * existed). Idempotent — already-encrypted values are left untouched, so
 * this is safe to call on every startup.
 */
export async function migrateLegacyToolCredentials(): Promise<void> {
  const rows = await db.select().from(toolServersTable);
  let migrated = 0;

  for (const row of rows) {
    const needsUsername = !!row.username && !isEncryptedValue(row.username);
    const needsPassword = !!row.password && !isEncryptedValue(row.password);
    if (!needsUsername && !needsPassword) continue;

    await db
      .update(toolServersTable)
      .set({
        username: needsUsername ? encryptToolCredential(row.username as string) : row.username,
        password: needsPassword ? encryptToolCredential(row.password as string) : row.password,
      })
      .where(eq(toolServersTable.id, row.id));
    migrated++;
  }

  if (migrated > 0) {
    logger.info({ count: migrated }, "Encrypted legacy plaintext tool_servers credentials at rest");
  }
}
