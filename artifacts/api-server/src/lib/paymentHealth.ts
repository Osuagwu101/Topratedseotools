import { logger } from "./logger";
import { getPaymentSettings, resolveActivePaystackSecretKey } from "./paymentSettings";

export interface PaymentDiagnosticResult {
  ok: boolean;
  message: string;
}

export type CheckSeverity = "ok" | "warning" | "error";

export interface PaymentHealthCheck {
  key: string;
  label: string;
  severity: CheckSeverity;
  message: string;
}

export interface PaymentHealthStatus {
  status: "healthy" | "warning" | "error";
  checks: PaymentHealthCheck[];
  checkedAt: string;
}

async function pingPaystack(secretKey: string): Promise<PaymentDiagnosticResult> {
  try {
    const res = await fetch("https://api.paystack.co/transaction/totals", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string };
    if (res.ok && body.status) return { ok: true, message: "Paystack accepted the active secret key." };
    return { ok: false, message: body.message || `Paystack rejected the key (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

const WEBHOOK_STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function verifyApiConnection(): Promise<PaymentDiagnosticResult> {
  const settings = await getPaymentSettings();
  const key = resolveActivePaystackSecretKey(settings);
  if (!key) {
    return { ok: false, message: `No ${settings.testMode ? "test" : "live"} secret key is configured.` };
  }
  return pingPaystack(key);
}

export async function verifyWebhooks(): Promise<PaymentDiagnosticResult> {
  const settings = await getPaymentSettings();
  const webhookPath = "/api/paystack/webhook";
  if (!settings.lastWebhookReceivedAt) {
    return {
      ok: false,
      message: `No webhook has been received yet. In your Paystack dashboard, set the webhook URL to end with ${webhookPath} and use their "Test webhook" feature to confirm delivery.`,
    };
  }
  const ageMs = Date.now() - new Date(settings.lastWebhookReceivedAt).getTime();
  if (ageMs > WEBHOOK_STALE_MS) {
    return {
      ok: false,
      message: `Last webhook was received on ${new Date(settings.lastWebhookReceivedAt).toLocaleString()}, over 30 days ago. Confirm the webhook URL is still configured correctly in Paystack.`,
    };
  }
  return { ok: true, message: `Last webhook received on ${new Date(settings.lastWebhookReceivedAt).toLocaleString()}.` };
}

export async function runTestPayment(): Promise<PaymentDiagnosticResult> {
  const settings = await getPaymentSettings();
  if (!settings.testMode) {
    return {
      ok: false,
      message: "Enable Test Mode first — running a test payment in Live mode could create a real charge.",
    };
  }
  const key = resolveActivePaystackSecretKey(settings);
  if (!key) {
    return { ok: false, message: "No test secret key is configured. Set PAYSTACK_TEST_SECRET_KEY first." };
  }

  try {
    const reference = `ADMINTEST-${Date.now()}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin-test@example.com",
        amount: 10000, // nominal amount in minor units; never tied to a real order
        currency: settings.currency,
        reference,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      data?: { authorization_url?: string };
      message?: string;
    };
    if (res.ok && body.status && body.data?.authorization_url) {
      return {
        ok: true,
        message: `Test transaction initialized successfully (reference ${reference}). This reference is not linked to any order and can be safely ignored.`,
      };
    }
    return { ok: false, message: body.message || `Paystack rejected the test transaction (HTTP ${res.status}).` };
  } catch (err) {
    logger.error({ err }, "Test payment failed");
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

export async function getPaymentHealth(): Promise<PaymentHealthStatus> {
  const settings = await getPaymentSettings();
  const key = resolveActivePaystackSecretKey(settings);
  const checks: PaymentHealthCheck[] = [];

  checks.push({
    key: "secret_key",
    label: "Secret key configured",
    severity: key ? "ok" : "error",
    message: key
      ? `Using the ${settings.testMode ? "test" : "live"} secret key.`
      : `No ${settings.testMode ? "test" : "live"} secret key is configured.`,
  });

  checks.push({
    key: "enabled",
    label: "Gateway enabled",
    severity: settings.enabled ? "ok" : "warning",
    message: settings.enabled ? "Accepting new checkouts." : "New checkouts are disabled by the admin.",
  });

  if (key) {
    const api = await pingPaystack(key);
    checks.push({
      key: "api",
      label: "Paystack API connectivity",
      severity: api.ok ? "ok" : "error",
      message: api.message,
    });
  } else {
    checks.push({
      key: "api",
      label: "Paystack API connectivity",
      severity: "error",
      message: "Skipped — no secret key configured.",
    });
  }

  const webhook = await verifyWebhooks();
  checks.push({
    key: "webhook",
    label: "Webhook delivery",
    severity: webhook.ok ? "ok" : "warning",
    message: webhook.message,
  });

  checks.push({
    key: "mode",
    label: "Mode",
    severity: "ok",
    message: settings.testMode ? "Test mode — no real charges are processed." : "Live mode — real charges will be processed.",
  });

  const status: PaymentHealthStatus["status"] = checks.some((c) => c.severity === "error")
    ? "error"
    : checks.some((c) => c.severity === "warning")
      ? "warning"
      : "healthy";

  return { status, checks, checkedAt: new Date().toISOString() };
}
