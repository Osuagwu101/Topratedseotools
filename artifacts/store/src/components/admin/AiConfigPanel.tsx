import { useEffect, useState, type ReactElement } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Wifi,
  RotateCcw,
  Save,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface AiSettings {
  id: number;
  aiProvider: string;
  aiModel: string;
  geminiModel: string;
  openaiEnabled: boolean;
  geminiEnabled: boolean;
  temperature: number;
  maxTokens: number;
  perUserDailyLimit: number;
  monthlyGenerationLimit: number;
  warningThresholdPercent: number;
  hasOpenAiKey: boolean;
  hasGeminiKey: boolean;
  openAiModels: string[];
  geminiModels: string[];
  updatedAt: string;
}

type Severity = "ok" | "warning" | "error";
interface HealthCheck { key: string; label: string; severity: Severity; message: string }
interface HealthStatus { status: "healthy" | "warning" | "error"; checks: HealthCheck[]; checkedAt: string }

async function fetchSettings(token: string): Promise<AiSettings> {
  const res = await fetch(`${API}/admin/ai-config`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchHealth(token: string): Promise<HealthStatus> {
  const res = await fetch(`${API}/admin/ai-config/health`, { headers: { Authorization: token } });
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

export default function AiConfigPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

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
      toast({ title: "Failed to load AI health status", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<AiSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/ai-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          geminiModel: settings.geminiModel,
          openaiEnabled: settings.openaiEnabled,
          geminiEnabled: settings.geminiEnabled,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          perUserDailyLimit: settings.perUserDailyLimit,
          monthlyGenerationLimit: settings.monthlyGenerationLimit,
          warningThresholdPercent: settings.warningThresholdPercent,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as AiSettings;
      setSettings(updated);
      setDirty(false);
      toast({ title: "AI configuration saved" });
      loadHealth();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    setResetting(true);
    try {
      const res = await fetch(`${API}/admin/ai-config/reset-default`, { method: "POST", headers: { Authorization: token } });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as AiSettings;
      setSettings(updated);
      setDirty(false);
      toast({ title: "AI configuration reset to defaults" });
      loadHealth();
    } catch (e: unknown) {
      toast({ title: "Reset failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const testConnection = async (provider: "openai" | "gemini") => {
    setTestingProvider(provider);
    try {
      const res = await fetch(`${API}/admin/ai-config/test/${provider}`, { method: "POST", headers: { Authorization: token } });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResults((prev) => ({ ...prev, [provider]: body }));
      loadHealth();
    } catch (e: unknown) {
      setTestResults((prev) => ({ ...prev, [provider]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setTestingProvider(null);
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
    return <p className="text-sm text-red-500 font-medium">{error || "Failed to load AI configuration."}</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> AI Configuration
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Control the OpenAI and Gemini providers behind the AI SEO Article Generator -- enable/disable, models, cost
            controls, and connection health.
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
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Providers</p>

        {(["openai", "gemini"] as const).map((provider) => {
          const enabled = provider === "openai" ? settings.openaiEnabled : settings.geminiEnabled;
          const hasKey = provider === "openai" ? settings.hasOpenAiKey : settings.hasGeminiKey;
          const result = testResults[provider];
          return (
            <div key={provider} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-foreground capitalize">{provider}</p>
                  <p className="text-sm text-muted-foreground">
                    {hasKey ? "API key configured." : "No API key configured -- set it in System Config."}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => testConnection(provider)}
                    disabled={testingProvider === provider || !hasKey}
                  >
                    {testingProvider === provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    Test Connection
                  </Button>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => patch(provider === "openai" ? { openaiEnabled: v } : { geminiEnabled: v })}
                  />
                </div>
              </div>
              {result && (
                <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {result.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <span>{result.message}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Default Provider</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.aiProvider}
              onChange={(e) => patch({ aiProvider: e.target.value })}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>
          <div />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">OpenAI Model</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.aiModel}
              onChange={(e) => patch({ aiModel: e.target.value })}
            >
              {settings.openAiModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Gemini Model</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={settings.geminiModel}
              onChange={(e) => patch({ geminiModel: e.target.value })}
            >
              {settings.geminiModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Generation Defaults</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Temperature (0-2)</label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => patch({ temperature: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Max Tokens</label>
            <Input
              type="number"
              min={256}
              max={16000}
              value={settings.maxTokens}
              onChange={(e) => patch({ maxTokens: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6 space-y-5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Usage Limits</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Per-user Daily Limit</label>
            <Input type="number" min={1} value={settings.perUserDailyLimit} onChange={(e) => patch({ perUserDailyLimit: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Monthly Site-wide Limit</label>
            <Input type="number" min={1} value={settings.monthlyGenerationLimit} onChange={(e) => patch({ monthlyGenerationLimit: Number(e.target.value) })} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Warn At (% of Cap)</label>
            <Input type="number" min={1} max={100} value={settings.warningThresholdPercent} onChange={(e) => patch({ warningThresholdPercent: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-xl border border-gray-100 p-5">
        <p className="text-xs text-gray-400">Last updated {new Date(settings.updatedAt).toLocaleString()}</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={resetDefaults} disabled={resetting} className="gap-2">
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset to Default
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
