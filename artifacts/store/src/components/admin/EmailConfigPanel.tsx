import { useEffect, useState, type ReactElement } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Send,
  ShieldCheck,
  Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface EmailSettings {
  id: number;
  enabled: boolean;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  hasApiKey: boolean;
  lastTestSentAt: string | null;
  lastTestSentToEmail: string | null;
  lastTestResultOk: boolean | null;
  lastTestResultMessage: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

type Severity = "ok" | "warning" | "error";
interface HealthCheck { key: string; label: string; severity: Severity; message: string }
interface HealthStatus { status: "healthy" | "warning" | "error"; checks: HealthCheck[]; checkedAt: string }

async function fetchSettings(token: string): Promise<EmailSettings> {
  const res = await fetch(`${API}/admin/email-config`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchHealth(token: string): Promise<HealthStatus> {
  const res = await fetch(`${API}/admin/email-config/health`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function HealthBadge({ status }: { status: HealthStatus["status"] }) {
  const map: Record<HealthStatus["status"], { cls: string; label: string; icon: ReactElement }> = {
    healthy: { cls: "bg-emerald-100 text-emerald-700", label: "Healthy", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    warning: { cls: "bg-amber-100 text-amber-700", label: "Warning", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    error: { cls: "bg-red-100 text-red-700", label: "Error", icon: <XCircle className="w-3.5 h-3.5" /> },
  };
  const v = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-sm font-semibold px-3 py-1 ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  );
}

function CheckSeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-600 shrink-0" />;
}

export default function EmailConfigPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setSettings(await fetchSettings(token));
      setDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      setHealth(await fetchHealth(token));
    } catch (e: unknown) {
      toast({ title: "Failed to load email health status", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<EmailSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/email-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          enabled: settings.enabled,
          senderEmail: settings.senderEmail ?? "",
          senderName: settings.senderName ?? "",
          replyToEmail: settings.replyToEmail ?? "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as EmailSettings;
      setSettings(updated);
      setDirty(false);
      toast({ title: "Email configuration saved" });
      loadHealth();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/admin/email-config/test-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult(body);
      load();
      loadHealth();
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch(`${API}/admin/email-config/verify`, { method: "POST", headers: { Authorization: token } });
      const body = (await res.json()) as { ok: boolean; message: string };
      setVerifyResult(body);
      loadHealth();
    } catch (e: unknown) {
      setVerifyResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setVerifying(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !settings) {
    return <p className="text-sm text-red-500 font-medium">{error || "Failed to load email configuration."}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase flex items-center gap-2">
            <Mail className="w-5 h-5" /> Email Configuration
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Sender identity and delivery health for transactional email via Resend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {healthLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : health && <HealthBadge status={health.status} />}
        </div>
      </div>

      {health && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Live health status</p>
          <ul className="space-y-2">
            {health.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                <CheckSeverityIcon severity={c.severity} />
                <span><span className="font-semibold">{c.label}:</span> {c.message}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">Checked {new Date(health.checkedAt).toLocaleString()}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Sender settings</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email sending enabled
            </p>
            <p className="text-sm text-muted-foreground">When off, Test Email is blocked and no transactional mail is sent.</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>

        {!settings.hasApiKey && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            No Resend API key is configured. Set RESEND_API_KEY in System Config before enabling email sending.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Sender Email</label>
            <Input
              type="email"
              value={settings.senderEmail ?? ""}
              onChange={(e) => patch({ senderEmail: e.target.value })}
              placeholder="orders@yourstore.com"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Sender Name</label>
            <Input
              value={settings.senderName ?? ""}
              onChange={(e) => patch({ senderName: e.target.value })}
              placeholder="Your Store"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Reply-To (optional)</label>
            <Input
              type="email"
              value={settings.replyToEmail ?? ""}
              onChange={(e) => patch({ replyToEmail: e.target.value })}
              placeholder="support@yourstore.com"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <p className="text-xs text-gray-400">
            {settings.updatedByEmail
              ? `Last updated by ${settings.updatedByEmail} on ${settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : "unknown"}`
              : settings.updatedAt
                ? `Last updated ${new Date(settings.updatedAt).toLocaleString()}`
                : "Not yet configured"}
          </p>
          <Button onClick={save} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Diagnostics</p>

        <div className="border border-gray-100 rounded-lg p-4 mb-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-foreground flex items-center gap-2 text-sm"><ShieldCheck className="w-4 h-4" /> Verify Configuration</p>
              <p className="text-xs text-muted-foreground mt-0.5">Checks sender identity and confirms the Resend API key is accepted, without sending anything.</p>
            </div>
            <Button size="sm" variant="outline" onClick={verify} disabled={verifying} className="gap-2">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
          {verifyResult && (
            <div className={`mt-2 flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 ${verifyResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {verifyResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span>{verifyResult.message}</span>
            </div>
          )}
        </div>

        <div className="border border-gray-100 rounded-lg p-4">
          <p className="font-semibold text-foreground flex items-center gap-2 text-sm mb-1"><Send className="w-4 h-4" /> Test Email</p>
          <p className="text-xs text-muted-foreground mb-3">Sends a real email through Resend using the sender identity above.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="max-w-xs"
            />
            <Button size="sm" onClick={sendTest} disabled={testing || !testTo.trim()} className="gap-2">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Test
            </Button>
          </div>
          {testResult && (
            <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
              <span>{testResult.message}</span>
            </div>
          )}
          {settings.lastTestSentAt && (
            <p className="text-xs text-gray-400 mt-3">
              Last test sent to {settings.lastTestSentToEmail} on {new Date(settings.lastTestSentAt).toLocaleString()}
              {settings.lastTestResultOk === false && " (failed)"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
