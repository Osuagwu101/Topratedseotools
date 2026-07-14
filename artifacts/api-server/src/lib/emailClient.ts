import { Resend } from "resend";
import { getConfigValue } from "./systemConfig";
import { getEmailSettings } from "./emailSettings";

/**
 * Resend client factory, mirroring openaiClient.ts/geminiClient.ts's
 * pattern: no module-scope caching of the API key, so an admin rotating
 * RESEND_API_KEY from the System Configuration Centre vault takes effect on
 * the very next send with no restart required.
 */
async function getResendClient(): Promise<Resend> {
  const key = await getConfigValue("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return new Resend(key);
}

export interface EmailDiagnosticResult {
  ok: boolean;
  message: string;
}

/**
 * Confirms the sender identity is filled in and the API key is present and
 * accepted by Resend, without actually sending anything. Resend has no
 * dedicated "ping" endpoint, so this lists API keys (a lightweight
 * authenticated call) as the connectivity check.
 */
export async function verifyEmailConfiguration(): Promise<EmailDiagnosticResult> {
  const settings = await getEmailSettings();
  if (!settings.senderEmail || !settings.senderEmail.trim()) {
    return { ok: false, message: "No sender email address is configured." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.senderEmail)) {
    return { ok: false, message: `"${settings.senderEmail}" does not look like a valid email address.` };
  }
  if (settings.replyToEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.replyToEmail)) {
    return { ok: false, message: `Reply-to address "${settings.replyToEmail}" does not look like a valid email address.` };
  }
  const key = await getConfigValue("RESEND_API_KEY");
  if (!key) {
    return { ok: false, message: "No Resend API key is configured." };
  }
  try {
    const resend = await getResendClient();
    const { error } = await resend.apiKeys.list();
    if (error) return { ok: false, message: error.message || "Resend rejected the API key." };
    return { ok: true, message: `Resend accepted the key. Sender identity: ${settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Resend." };
  }
}

/**
 * Sends a real test email through Resend to an admin-supplied address, using
 * the configured sender identity. Requires `enabled` -- an admin must
 * explicitly turn email sending on, even just to test it, so a
 * half-configured integration can't fire off mail by accident.
 */
export async function sendTestEmail(toEmail: string): Promise<EmailDiagnosticResult> {
  const settings = await getEmailSettings();
  if (!settings.enabled) {
    return { ok: false, message: "Email sending is disabled. Enable it above before sending a test." };
  }
  if (!settings.senderEmail) {
    return { ok: false, message: "Set a sender email address before sending a test." };
  }
  const key = await getConfigValue("RESEND_API_KEY");
  if (!key) {
    return { ok: false, message: "No Resend API key is configured." };
  }
  try {
    const resend = await getResendClient();
    const from = settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail;
    const { data, error } = await resend.emails.send({
      from,
      to: toEmail,
      replyTo: settings.replyToEmail || undefined,
      subject: "Test email from your store's Email Configuration Centre",
      html: `<p>This is a test email confirming your Resend configuration works.</p><p>Sent ${new Date().toLocaleString()}.</p>`,
    });
    if (error) return { ok: false, message: error.message || "Resend rejected the send request." };
    return { ok: true, message: `Test email sent to ${toEmail} (Resend id: ${data?.id ?? "unknown"}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Resend." };
  }
}
