import { logger } from "./logger";
import { hasDurableEncryptionKey } from "./secretsVault";

/**
 * Fails the boot loudly when a truly load-bearing secret is missing, and
 * warns (without crashing) when an optional-but-recommended one is absent.
 * This replaces the old pattern of silently falling back to an insecure
 * hardcoded default (see analyticsSettings.ts's former SESSION_SECRET
 * fallback) with either a hard stop or a visible, actionable warning.
 */
export function validateStartupSecrets(): void {
  const missingRequired: string[] = [];

  if (!process.env.SESSION_SECRET) {
    missingRequired.push("SESSION_SECRET");
  }
  if (!process.env.DATABASE_URL) {
    missingRequired.push("DATABASE_URL");
  }

  if (missingRequired.length > 0) {
    throw new Error(
      `Refusing to start: required secret(s) missing: ${missingRequired.join(", ")}. ` +
        "Set them via Replit Secrets before starting the server.",
    );
  }

  if (!hasDurableEncryptionKey()) {
    logger.warn(
      "ENCRYPTION_KEY is not set. The System Configuration Centre will still work this session, but any " +
        "credentials saved there will need to be re-entered after the next restart. Set ENCRYPTION_KEY via " +
        "Replit Secrets to persist them durably.",
    );
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    logger.info(
      "ADMIN_USERNAME/ADMIN_PASSWORD are not set — skipping Super Admin bootstrap. If no administrator " +
        "account exists yet, create the first one directly in the staff_users table.",
    );
  }
}
