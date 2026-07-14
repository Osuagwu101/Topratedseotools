import { getEmailSettings } from "./emailSettings";
import { getConfigValue } from "./systemConfig";
import { verifyEmailConfiguration } from "./emailClient";

export type CheckSeverity = "ok" | "warning" | "error";

export interface EmailHealthCheck {
  key: string;
  label: string;
  severity: CheckSeverity;
  message: string;
}

export interface EmailHealthStatus {
  status: "healthy" | "warning" | "error";
  checks: EmailHealthCheck[];
  checkedAt: string;
}

export async function getEmailHealth(): Promise<EmailHealthStatus> {
  const settings = await getEmailSettings();
  const key = await getConfigValue("RESEND_API_KEY");
  const checks: EmailHealthCheck[] = [];

  checks.push({
    key: "enabled",
    label: "Email sending enabled",
    severity: settings.enabled ? "ok" : "warning",
    message: settings.enabled ? "Email sending is turned on." : "Email sending is turned off by the admin.",
  });

  checks.push({
    key: "api_key",
    label: "Resend API key configured",
    severity: key ? "ok" : "error",
    message: key ? "A Resend API key is configured." : "No Resend API key is configured.",
  });

  checks.push({
    key: "sender",
    label: "Sender identity",
    severity: settings.senderEmail ? "ok" : "error",
    message: settings.senderEmail
      ? `Sending as ${settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail}.`
      : "No sender email address is configured.",
  });

  if (key && settings.senderEmail) {
    const result = await verifyEmailConfiguration();
    checks.push({
      key: "connectivity",
      label: "Resend API connectivity",
      severity: result.ok ? "ok" : "error",
      message: result.message,
    });
  } else {
    checks.push({
      key: "connectivity",
      label: "Resend API connectivity",
      severity: "error",
      message: "Skipped -- fix the missing configuration above first.",
    });
  }

  const status: EmailHealthStatus["status"] = checks.some((c) => c.severity === "error")
    ? "error"
    : checks.some((c) => c.severity === "warning")
      ? "warning"
      : "healthy";

  return { status, checks, checkedAt: new Date().toISOString() };
}
