// Tiny standalone module (no other lib/ imports) so both backupEngine.ts and
// deploymentSafety.ts can read the current environment without creating an
// import cycle between them.
export type Environment = "development" | "production";

export function getEnvironment(): Environment {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export interface EnvironmentInfo {
  environment: Environment;
  nodeEnv: string;
  /** Host portion only (e.g. "ep-example-123.us-east-2.aws.neon.tech") — never the full connection string, so credentials are never exposed. */
  databaseHost: string | null;
  /** True once Replit's own deployment layer has assigned a production Neon database, distinct from the dev database this workspace normally points at. */
  hasDistinctDatabase: boolean;
  processId: number;
  uptimeSeconds: number;
}

function maskDatabaseHost(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).host || null;
  } catch {
    return null;
  }
}

/**
 * Single source of truth for "what environment am I, and what am I actually
 * pointed at" — surfaced in the Super Admin Dashboard's persistent badge and
 * the System Health report. Never returns the raw DATABASE_URL (which
 * contains credentials), only its host, so this is always safe to send to
 * the browser.
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  const environment = getEnvironment();
  const databaseHost = maskDatabaseHost(process.env.DATABASE_URL);
  return {
    environment,
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseHost,
    hasDistinctDatabase: environment === "production",
    processId: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
  };
}
