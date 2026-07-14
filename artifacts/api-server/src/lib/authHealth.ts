import { clerkClient } from "@clerk/express";
import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getConfigValue } from "./systemConfig";

export type CheckSeverity = "ok" | "warning" | "error" | "info";

export interface AuthMethodStatus {
  key: string;
  label: string;
  severity: CheckSeverity;
  message: string;
  /**
   * True when this method's on/off state is not something this app can
   * toggle — it is configured entirely from the Replit Auth pane (Clerk's
   * social connections, MFA, etc. have no dashboard or API in the
   * Replit-managed Clerk tenant). Surfaced so the Authentication Manager UI
   * can grey out a toggle rather than fake one that does nothing.
   */
  managedExternally: boolean;
}

export interface AuthHealthStatus {
  status: "healthy" | "warning" | "error";
  checks: AuthMethodStatus[];
  checkedAt: string;
}

async function pingClerk(): Promise<{ ok: boolean; message: string }> {
  try {
    // Lightest-weight authenticated call available: fetch a single user page.
    // Confirms the secret key is valid and Clerk is reachable without
    // touching any customer data.
    await clerkClient.users.getUserList({ limit: 1 });
    return { ok: true, message: "Clerk accepted the secret key." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Clerk." };
  }
}

async function readOneClickFlag(): Promise<boolean> {
  const [row] = await db
    .select({ oneClickAuthEnabled: featureFlagsTable.oneClickAuthEnabled })
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.id, 1));
  // Same default the flags table itself uses when the row hasn't been created yet.
  return row?.oneClickAuthEnabled ?? true;
}

/**
 * Authentication Manager status for every login method the store surfaces.
 *
 * Clerk is the only auth backend in this app, and — per the Replit-managed
 * Clerk model — its social connections (Google, GitHub), email/password
 * strategy, and MFA are configured exclusively through the workspace's Auth
 * pane; there is no external Clerk dashboard and no API this server can use
 * to read or change those settings (see clerkProxyMiddleware.ts). Reporting
 * a live on/off toggle for them here would be fabricated. Instead this
 * reports what the server *can* verify (keys present, Clerk reachable) and
 * is explicit that provider enablement itself lives in the Auth pane.
 *
 * One-Click Login is the one login-adjacent method actually owned by this
 * app (the One-Click Auth proxy + its feature flag), so it gets a real,
 * live status instead of an external-management notice.
 */
export async function getAuthHealth(): Promise<AuthHealthStatus> {
  const checks: AuthMethodStatus[] = [];

  const [publishableKey, secretKey] = await Promise.all([
    getConfigValue("CLERK_PUBLISHABLE_KEY"),
    getConfigValue("CLERK_SECRET_KEY"),
  ]);
  const keysConfigured = Boolean(publishableKey && secretKey);

  checks.push({
    key: "clerk_keys",
    label: "Clerk",
    severity: keysConfigured ? "ok" : "error",
    message: keysConfigured
      ? "Publishable and secret keys are configured."
      : "Missing a Clerk publishable and/or secret key — sign-in will not work.",
    managedExternally: false,
  });

  if (keysConfigured) {
    const ping = await pingClerk();
    checks.push({
      key: "clerk_connectivity",
      label: "Clerk API connectivity",
      severity: ping.ok ? "ok" : "error",
      message: ping.message,
      managedExternally: false,
    });
  } else {
    checks.push({
      key: "clerk_connectivity",
      label: "Clerk API connectivity",
      severity: "error",
      message: "Skipped — Clerk keys are not configured.",
      managedExternally: false,
    });
  }

  checks.push({
    key: "email_login",
    label: "Email Login",
    severity: "info",
    message: "Email/password sign-in is provided by Clerk and managed from the Auth pane in the workspace toolbar.",
    managedExternally: true,
  });

  checks.push({
    key: "google_login",
    label: "Google Login",
    severity: "info",
    message: "Social sign-in providers (Google, GitHub, etc.) are enabled or disabled from the Auth pane, not from this app.",
    managedExternally: true,
  });

  checks.push({
    key: "github_login",
    label: "GitHub Login",
    severity: "info",
    message: "Social sign-in providers (Google, GitHub, etc.) are enabled or disabled from the Auth pane, not from this app.",
    managedExternally: true,
  });

  checks.push({
    key: "two_factor",
    label: "Two-Factor Authentication",
    severity: "info",
    message: "Multi-factor authentication is not yet supported by this project's Clerk Auth tenant.",
    managedExternally: true,
  });

  const oneClickEnabled = await readOneClickFlag();
  checks.push({
    key: "one_click_login",
    label: "One-Click Login",
    severity: oneClickEnabled ? "ok" : "warning",
    message: oneClickEnabled
      ? "Enabled — customers can launch owned tools without re-entering credentials."
      : "Disabled by the admin in Feature Management. Individual tools may still show as off even if re-enabled here.",
    managedExternally: false,
  });

  // Only the checks this app actually controls should affect the rollup
  // status — an "info" (externally-managed) row is never a warning/error by
  // itself, so the overall badge reflects real, actionable problems only.
  const status: AuthHealthStatus["status"] = checks.some((c) => c.severity === "error")
    ? "error"
    : checks.some((c) => c.severity === "warning")
      ? "warning"
      : "healthy";

  return { status, checks, checkedAt: new Date().toISOString() };
}
