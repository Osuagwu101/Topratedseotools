import crypto from "crypto";
import { logger } from "./logger";

// Generic AES-256-GCM encrypt/decrypt for encrypted-at-rest credential
// stores. Both the System Configuration Centre's credential store
// (systemConfig.ts) and the shared tool-login credential store
// (toolCredentials.ts / tool_servers table) use this module, each under its
// own label. Labels derive distinct sub-keys from the same ENCRYPTION_KEY so
// the two stores are cryptographically independent — compromising or
// rotating one label's derived key never affects the other's ciphertexts.
// This is deliberately kept separate from analyticsSettings.ts's own
// encryption (which derives its key from SESSION_SECRET, guaranteed present
// by startup validation): the vault here manages *user-editable* third-party
// credentials and always wants a key derived from ENCRYPTION_KEY so rotating
// SESSION_SECRET never breaks previously stored secrets, and vice versa.

const SYSTEM_CONFIG_LABEL = "system-config-vault";
const TOOL_SERVERS_LABEL = "tool-servers-vault";

let ephemeralKey: Buffer | undefined;
let ephemeralKeyWarned = false;

function getEncryptionKey(label: string): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (secret) {
    return crypto.createHash("sha256").update(`${label}:${secret}`).digest();
  }
  // No dedicated ENCRYPTION_KEY configured. Rather than fall back to a
  // hardcoded/insecure default (the bug we are fixing elsewhere), degrade
  // visibly: encrypt with a random key that lives only for this process's
  // lifetime. Anything saved to the vault under this key will fail to
  // decrypt after the next restart -- a loud, self-correcting failure
  // instead of a silent weak secret. Set ENCRYPTION_KEY to make it durable.
  // The same ephemeral key is shared across labels in this degraded mode —
  // it's random and process-local either way, so there's nothing to
  // separate.
  if (!ephemeralKeyWarned) {
    ephemeralKeyWarned = true;
    logger.warn(
      "ENCRYPTION_KEY is not set. Encrypted credentials (System Configuration Centre and shared tool logins) " +
        "will be encrypted with a temporary, process-local key and will become unreadable after the next " +
        "restart. Set ENCRYPTION_KEY (via Secrets) to store credentials durably.",
    );
  }
  if (!ephemeralKey) ephemeralKey = crypto.randomBytes(32);
  return ephemeralKey;
}

function encryptWithLabel(label: string, plaintext: string): string {
  const key = getEncryptionKey(label);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptWithLabel(label: string, ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey(label);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/** Ciphertext produced by any `encryptWithLabel` call: `iv:authTag:data`, all hex. */
export function isEncryptedValue(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value);
}

export function encryptSecret(plaintext: string): string {
  return encryptWithLabel(SYSTEM_CONFIG_LABEL, plaintext);
}

export function decryptSecret(ciphertext: string): string {
  return decryptWithLabel(SYSTEM_CONFIG_LABEL, ciphertext);
}

// Dedicated encrypt/decrypt pair for tool_servers.username/password (shared
// third-party tool login credentials) — see toolCredentials.ts for the
// higher-level helpers most call sites should use instead of these directly.
export function encryptToolCredential(plaintext: string): string {
  return encryptWithLabel(TOOL_SERVERS_LABEL, plaintext);
}

export function decryptToolCredential(ciphertext: string): string {
  return decryptWithLabel(TOOL_SERVERS_LABEL, ciphertext);
}

export function maskSecret(plaintext: string): string {
  if (!plaintext) return "";
  const visible = Math.min(4, plaintext.length);
  const stars = Math.max(8, plaintext.length - visible);
  return "•".repeat(stars) + plaintext.slice(-visible);
}

/** True once a durable ENCRYPTION_KEY has been provided via the environment. */
export function hasDurableEncryptionKey(): boolean {
  return !!process.env.ENCRYPTION_KEY;
}
