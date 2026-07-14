import crypto from "crypto";
import { logger } from "./logger";

// Generic AES-256-GCM encrypt/decrypt for the System Configuration Centre's
// encrypted credential store (systemConfig.ts). This is deliberately kept
// separate from analyticsSettings.ts's own encryption (which now derives its
// key from SESSION_SECRET, guaranteed present by startup validation): the
// vault here manages *user-editable* third-party credentials and always
// wants a dedicated key so rotating SESSION_SECRET never breaks previously
// stored secrets, and vice versa.

let ephemeralKey: Buffer | undefined;
let ephemeralKeyWarned = false;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (secret) {
    return crypto.createHash("sha256").update(`system-config-vault:${secret}`).digest();
  }
  // No dedicated ENCRYPTION_KEY configured. Rather than fall back to a
  // hardcoded/insecure default (the bug we are fixing elsewhere), degrade
  // visibly: encrypt with a random key that lives only for this process's
  // lifetime. Anything saved to the vault under this key will fail to
  // decrypt after the next restart -- a loud, self-correcting failure
  // instead of a silent weak secret. Set ENCRYPTION_KEY to make it durable.
  if (!ephemeralKeyWarned) {
    ephemeralKeyWarned = true;
    logger.warn(
      "ENCRYPTION_KEY is not set. System Configuration Centre secrets will be encrypted with a temporary, " +
        "process-local key and will become unreadable after the next restart. Set ENCRYPTION_KEY (via Secrets) " +
        "to store credentials durably.",
    );
  }
  if (!ephemeralKey) ephemeralKey = crypto.randomBytes(32);
  return ephemeralKey;
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
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
