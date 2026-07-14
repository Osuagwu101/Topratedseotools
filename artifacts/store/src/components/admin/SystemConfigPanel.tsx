import { useEffect, useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Save,
  Trash2,
  History,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface ConfigStatus {
  key: string;
  label: string;
  category: "payment" | "ai" | "auth" | "email" | "infrastructure";
  description: string;
  required: boolean;
  envOnly: boolean;
  source: "database" | "environment" | "unset";
  masked: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
  hasTest: boolean;
}

interface AuditLogEntry {
  id: number;
  configKey: string;
  action: string;
  staffEmail: string | null;
  staffName: string | null;
  detail: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<ConfigStatus["category"], string> = {
  payment: "Payment",
  ai: "AI Providers",
  auth: "Authentication",
  email: "Email",
  infrastructure: "Infrastructure",
};

const CATEGORY_ORDER: ConfigStatus["category"][] = ["infrastructure", "auth", "payment", "ai", "email"];

async function fetchStatuses(token: string): Promise<ConfigStatus[]> {
  const res = await fetch(`${API}/admin/system-config`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchAuditLog(token: string): Promise<AuditLogEntry[]> {
  const res = await fetch(`${API}/admin/system-config/audit-log`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function SourceBadge({ source }: { source: ConfigStatus["source"] }) {
  if (source === "database") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5">
        <ShieldCheck className="w-3 h-3" /> Managed here
      </span>
    );
  }
  if (source === "environment") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-0.5">
        From environment
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-0.5">
      <AlertTriangle className="w-3 h-3" /> Not set
    </span>
  );
}

function ConfigRow({
  status,
  token,
  onChanged,
}: {
  status: ConfigStatus;
  token: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/system-config/${status.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ value: value.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${status.label} saved` });
      setEditing(false);
      setValue("");
      setTestResult(null);
      onChanged();
    } catch (e: unknown) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm(`Revert ${status.label} to its environment variable value?`)) return;
    try {
      const res = await fetch(`${API}/admin/system-config/${status.key}`, {
        method: "DELETE",
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `${status.label} reverted to environment` });
      onChanged();
    } catch (e: unknown) {
      toast({ title: "Failed to clear", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/admin/system-config/${status.key}/test`, {
        method: "POST",
        headers: { Authorization: token },
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult(body);
    } catch (e: unknown) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-[200px]">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground">{status.label}</p>
            <SourceBadge source={status.source} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{status.description}</p>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            {status.masked ?? "No value configured"}
            {status.updatedByEmail ? ` — last updated by ${status.updatedByEmail}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.hasTest && (
            <Button size="sm" variant="outline" onClick={test} disabled={testing || status.source === "unset"}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test connection"}
            </Button>
          )}
          {status.envOnly ? (
            <span className="text-xs text-gray-400 italic">Set via Replit Secrets only</span>
          ) : (
            <>
              {!editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <KeyRound className="w-4 h-4 mr-1" /> {status.source === "unset" ? "Set" : "Rotate"}
                </Button>
              )}
              {status.source === "database" && !status.required && (
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={clear}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
            testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {testResult.message}
        </div>
      )}

      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={showValue ? "text" : "password"}
              placeholder={`New ${status.label}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="pr-10"
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowValue((v) => !v)}
            >
              {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button size="sm" onClick={save} disabled={saving || !value.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(""); }}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SystemConfigPanel({ token }: { token: string }) {
  const [statuses, setStatuses] = useState<ConfigStatus[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAudit, setShowAudit] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, a] = await Promise.all([fetchStatuses(token), fetchAuditLog(token)]);
      setStatuses(s);
      setAuditLog(a);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && statuses.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: statuses.filter((s) => s.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase">System Configuration</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage API credentials and infrastructure secrets. Values are encrypted at rest and never shown in full
            once saved.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAudit((v) => !v)}>
          <History className="w-4 h-4 mr-1" /> {showAudit ? "Hide" : "View"} audit log
        </Button>
      </div>

      {error && <p className="text-sm text-red-500 font-medium mb-4">{error}</p>}

      {showAudit && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 max-h-72 overflow-y-auto">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Recent activity</p>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No configuration changes yet.</p>
          ) : (
            <ul className="space-y-2">
              {auditLog.map((entry) => (
                <li key={entry.id} className="text-sm flex justify-between gap-4 border-b border-gray-50 pb-2 last:border-0">
                  <span>
                    {entry.detail || `${entry.action} ${entry.configKey}`}
                    {entry.staffEmail ? ` — ${entry.staffEmail}` : ""}
                  </span>
                  <span className="text-gray-400 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-8">
        {grouped.map((group) => (
          <div key={group.category}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              {CATEGORY_LABELS[group.category]}
            </h3>
            <div className="space-y-3">
              {group.items.map((status) => (
                <ConfigRow key={status.key} status={status} token={token} onChanged={load} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
