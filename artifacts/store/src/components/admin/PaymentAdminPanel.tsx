import { useEffect, useState, type ReactElement } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Wrench,
  Wifi,
  Webhook,
  FlaskConical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface PaymentSettings {
  id: number;
  enabled: boolean;
  testMode: boolean;
  currency: string;
  taxPercent: number;
  feePercent: number;
  feeFlatKobo: number;
  minPurchaseKobo: number;
  maxPurchaseKobo: number | null;
  lastWebhookReceivedAt: string | null;
  updatedAt: string;
  updatedByEmail: string | null;
}

type Severity = "ok" | "warning" | "error";

interface HealthCheck {
  key: string;
  label: string;
  severity: Severity;
  message: string;
}

interface HealthStatus {
  status: "healthy" | "warning" | "error";
  checks: HealthCheck[];
  checkedAt: string;
}

interface DiagnosticResult {
  ok: boolean;
  message: string;
  changes?: string[];
}

const CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR"];

async function fetchSettings(token: string): Promise<PaymentSettings> {
  const res = await fetch(`${API}/admin/payment-settings`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchHealth(token: string): Promise<HealthStatus> {
  const res = await fetch(`${API}/admin/payment-health`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function HealthBadge({ status }: { status: HealthStatus["status"] }) {
  const map: Record<HealthStatus["status"], { cls: string; label: string; icon: ReactElement }> = {
    healthy: {
      cls: "bg-emerald-100 text-emerald-700",
      label: "Healthy",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    warning: {
      cls: "bg-amber-100 text-amber-700",
      label: "Warning",
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
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

export default function PaymentAdminPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, DiagnosticResult>>({});

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
      toast({ title: "Failed to load health status", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<PaymentSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/payment-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          enabled: settings.enabled,
          testMode: settings.testMode,
          currency: settings.currency,
          taxPercent: settings.taxPercent,
          feePercent: settings.feePercent,
          feeFlatKobo: settings.feeFlatKobo,
          minPurchaseKobo: settings.minPurchaseKobo,
          maxPurchaseKobo: settings.maxPurchaseKobo,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as PaymentSettings;
      setSettings(updated);
      setDirty(false);
      toast({ title: "Payment settings saved" });
      loadHealth();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: string) => {
    setRunningAction(action);
    try {
      const res = await fetch(`${API}/admin/payment-actions/${action}`, {
        method: "POST",
        headers: { Authorization: token },
      });
      const body = (await res.json()) as DiagnosticResult;
      setActionResults((prev) => ({ ...prev, [action]: body }));
      if (action === "reload-config" || action === "refresh-cache" || action === "repair-config") {
        load();
      }
      loadHealth();
    } catch (e: unknown) {
      setActionResults((prev) => ({
        ...prev,
        [action]: { ok: false, message: e instanceof Error ? e.message : String(e) },
      }));
    } finally {
      setRunningAction(null);
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
    return <p className="text-sm text-red-500 font-medium">{error || "Failed to load payment settings."}</p>;
  }

  const actions: { key: string; label: string; icon: ReactElement; description: string }[] = [
    { key: "test-payment", label: "Test Payment", icon: <FlaskConical className="w-4 h-4" />, description: "Initializes a nominal test-mode transaction (only available in Test Mode)." },
    { key: "verify-api", label: "Verify API Connection", icon: <Wifi className="w-4 h-4" />, description: "Confirms the active secret key is accepted by Paystack right now." },
    { key: "verify-webhooks", label: "Verify Webhooks", icon: <Webhook className="w-4 h-4" />, description: "Reports when the last webhook was received." },
    { key: "reload-config", label: "Reload Payment Configuration", icon: <RefreshCw className="w-4 h-4" />, description: "Re-reads settings and re-validates the active key resolves." },
    { key: "refresh-cache", label: "Refresh Payment Cache", icon: <RefreshCw className="w-4 h-4" />, description: "Clears the in-memory settings cache so the next request reads fresh values." },
    { key: "repair-config", label: "Repair Payment Configuration", icon: <Wrench className="w-4 h-4" />, description: "Automatically fixes invalid stored values (negative %, bad currency, etc.)." },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase">Payment Management</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Control and troubleshoot Paystack checkout without editing code or environment variables.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {healthLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            health && <HealthBadge status={health.status} />
          )}
        </div>
      </div>

      {health && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Live health status</p>
          <ul className="space-y-2">
            {health.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                <CheckSeverityIcon severity={c.severity} />
                <span>
                  <span className="font-semibold">{c.label}:</span> {c.message}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400 mt-3">Checked {new Date(health.checkedAt).toLocaleString()}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Gateway settings</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Payments enabled
            </p>
            <p className="text-sm text-muted-foreground">When off, checkout is blocked for new orders.</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Test Mode</p>
            <p className="text-sm text-muted-foreground">
              Uses the Paystack test secret key instead of the live key. No real charges are made.
            </p>
          </div>
          <Switch checked={settings.testMode} onCheckedChange={(v) => patch({ testMode: v })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Currency</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.currency}
              onChange={(e) => patch({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Tax (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.taxPercent}
              onChange={(e) => patch({ taxPercent: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Processing fee (%)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={settings.feePercent}
              onChange={(e) => patch({ feePercent: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Flat processing fee (minor units)
            </label>
            <Input
              type="number"
              min={0}
              value={settings.feeFlatKobo}
              onChange={(e) => patch({ feeFlatKobo: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Minimum purchase (minor units)
            </label>
            <Input
              type="number"
              min={0}
              value={settings.minPurchaseKobo}
              onChange={(e) => patch({ minPurchaseKobo: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Maximum purchase (minor units, blank = no limit)
            </label>
            <Input
              type="number"
              min={0}
              value={settings.maxPurchaseKobo ?? ""}
              onChange={(e) => patch({ maxPurchaseKobo: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <p className="text-xs text-gray-400">
            {settings.updatedByEmail
              ? `Last updated by ${settings.updatedByEmail} on ${new Date(settings.updatedAt).toLocaleString()}`
              : `Last updated ${new Date(settings.updatedAt).toLocaleString()}`}
          </p>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Diagnostics</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((a) => {
            const result = actionResults[a.key];
            return (
              <div key={a.key} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-2 text-sm">
                      {a.icon} {a.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runAction(a.key)}
                    disabled={runningAction === a.key}
                  >
                    {runningAction === a.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run"}
                  </Button>
                </div>
                {result && (
                  <div
                    className={`mt-2 flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 ${
                      result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {result.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    )}
                    <span>
                      {result.message}
                      {result.changes && result.changes.length > 0 && (
                        <ul className="list-disc list-inside mt-1">
                          {result.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
