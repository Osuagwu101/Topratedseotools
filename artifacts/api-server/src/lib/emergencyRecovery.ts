import { hydrateProcessEnvFromConfig } from "./systemConfig";
import { rebuildAllCaches } from "./cacheMaintenance";
import { getSystemHealth, type SystemHealthReport } from "./systemHealth";
import { verifyApiConnection as verifyPaystackConnection } from "./paymentHealth";
import { getAuthHealth } from "./authHealth";
import { getAiHealth } from "./aiHealth";
import { verifyEmailConfiguration } from "./emailClient";

export interface RecoveryActionResult {
  action: string;
  ok: boolean;
  detail: string;
}

/**
 * Every action here is a configuration/cache/connectivity operation only —
 * none of them read, write, or delete products, users, orders, subscriptions,
 * coupons, or any other business-data table. That boundary is what makes
 * this centre safe to run without a confirmation dialog per action.
 */

export async function verifyAllServices(): Promise<SystemHealthReport> {
  return getSystemHealth();
}

/**
 * "Reload Configuration": re-hydrates process.env from every DB-stored
 * System Configuration override. Useful after a restart-less config write
 * didn't take effect in some code path, or to re-assert DB values are
 * winning over stale environment ones.
 */
export async function reloadConfiguration(): Promise<RecoveryActionResult> {
  try {
    await hydrateProcessEnvFromConfig();
    return { action: "reload_configuration", ok: true, detail: "Re-applied every stored configuration override to the running server." };
  } catch (err) {
    return { action: "reload_configuration", ok: false, detail: err instanceof Error ? err.message : "Failed to reload configuration." };
  }
}

/**
 * "Repair Configuration": reloads configuration and rebuilds every cache in
 * one step, then reports whatever is still broken so the admin knows what
 * needs a real credential fix (which this tool cannot do for them).
 */
export async function repairConfiguration(): Promise<RecoveryActionResult> {
  await hydrateProcessEnvFromConfig();
  const cacheResult = await rebuildAllCaches();
  const health = await getSystemHealth();
  const broken = health.services.filter((s) => s.status === "error");
  const detail =
    broken.length === 0
      ? `Reloaded configuration and rebuilt caches. All services are healthy. ${cacheResult.detail}`
      : `Reloaded configuration and rebuilt caches. Still needs attention: ${broken.map((s) => `${s.label} (${s.summary})`).join("; ")}`;
  return { action: "repair_configuration", ok: broken.length === 0, detail };
}

/**
 * "Refresh API Connections": clears cached settings so the very next
 * request re-reads credentials fresh, then immediately re-pings every
 * external API to confirm connectivity right away instead of waiting for
 * the next real request to discover a problem.
 */
export async function refreshApiConnections(): Promise<RecoveryActionResult> {
  await rebuildAllCaches();
  const [paystack, auth, ai] = await Promise.all([verifyPaystackConnection(), getAuthHealth(), getAiHealth()]);
  const emailResult = await verifyEmailConfiguration().catch((err) => ({ ok: false, message: err instanceof Error ? err.message : "Failed" }));
  const parts = [
    `Paystack: ${paystack.ok ? "ok" : `failed (${paystack.message})`}`,
    `Clerk: ${auth.status === "error" ? "failed" : "ok"}`,
    `AI: ${ai.status === "error" ? "failed" : "ok"}`,
    `Email: ${emailResult.ok ? "ok" : `failed (${emailResult.message})`}`,
  ];
  const anyFailed = !paystack.ok || auth.status === "error" || ai.status === "error" || !emailResult.ok;
  return { action: "refresh_api_connections", ok: !anyFailed, detail: parts.join(" · ") };
}

export type VerifiableService = "payment" | "authentication" | "ai" | "email";

export async function verifyService(service: VerifiableService): Promise<RecoveryActionResult> {
  switch (service) {
    case "payment": {
      const result = await verifyPaystackConnection();
      return { action: "verify_payment", ok: result.ok, detail: result.message };
    }
    case "authentication": {
      const health = await getAuthHealth();
      const connectivity = health.checks.find((c) => c.key === "clerk_connectivity");
      return { action: "verify_authentication", ok: health.status !== "error", detail: connectivity?.message ?? "Unknown" };
    }
    case "ai": {
      const health = await getAiHealth();
      const availability = health.checks.find((c) => c.key === "availability");
      return { action: "verify_ai", ok: health.status !== "error", detail: availability?.message ?? "Unknown" };
    }
    case "email": {
      const result = await verifyEmailConfiguration();
      return { action: "verify_email", ok: result.ok, detail: result.message };
    }
  }
}
