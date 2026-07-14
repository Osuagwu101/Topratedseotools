import { useEffect, useState, useCallback } from "react";
import { DatabaseBackup, Download, Loader2, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface BackupScopeDef {
  key: string;
  label: string;
  description: string;
  type: "full" | "database" | "partial";
}

interface BackupRow {
  id: number;
  type: string;
  scope: string;
  status: "running" | "completed" | "failed";
  sizeBytes: number | null;
  storagePath: string | null;
  trigger: string;
  createdByEmail: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

function fmtBytes(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function BackupsPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [scopes, setScopes] = useState<BackupScopeDef[]>([]);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [scope, setScope] = useState("full");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scopesRes, backupsRes] = await Promise.all([
        fetch(`${API}/admin/backups/scopes`, { headers: { Authorization: token } }),
        fetch(`${API}/admin/backups`, { headers: { Authorization: token } }),
      ]);
      if (!scopesRes.ok) throw new Error(await scopesRes.text());
      if (!backupsRes.ok) throw new Error(await backupsRes.text());
      const scopeList = await scopesRes.json();
      setScopes(scopeList);
      setBackups(await backupsRes.json());
      if (scopeList.length && !scopeList.some((s: BackupScopeDef) => s.key === scope)) setScope(scopeList[0].key);
    } catch (e: unknown) {
      toast({ title: "Failed to load backups", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast, scope]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API}/admin/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create backup.");
      toast({ title: "Backup created" });
      await load();
    } catch (e: unknown) {
      toast({ title: "Backup failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (id: number) => {
    const url = `${API}/admin/backups/${id}/download`;
    fetch(url, { headers: { Authorization: token } })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed.");
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match?.[1] ?? `backup-${id}.json.gz`;
        const a = document.createElement("a");
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      })
      .catch((e: unknown) => toast({ title: "Download failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Backups</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Create on-demand backups, and see the ones auto-created before risky operations by Deployment Safety.
        </p>
      </div>

      <div className="border border-gray-100 rounded-xl p-4 bg-white flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 w-full sm:w-auto"
        >
          {scopes.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground flex-1 order-3 sm:order-none">
          {scopes.find((s) => s.key === scope)?.description}
        </p>
        <Button onClick={handleCreate} disabled={creating} className="whitespace-nowrap">
          {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <DatabaseBackup className="w-4 h-4 mr-1.5" />}
          Create Backup
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">History</h3>
          <button onClick={() => load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.id} className="border border-gray-100 rounded-xl p-3 bg-white flex items-center gap-3">
                <div className="shrink-0">
                  {b.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  {b.status === "failed" && <XCircle className="w-4 h-4 text-red-600" />}
                  {b.status === "running" && <Clock className="w-4 h-4 text-amber-600 animate-pulse" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground capitalize">
                    {b.scope} <span className="text-xs font-normal text-muted-foreground">({b.type})</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmt(b.createdAt)} · {fmtBytes(b.sizeBytes)} ·{" "}
                    {b.trigger === "manual" ? "Manual" : `Auto (before "${b.trigger.replace(/_/g, " ")}")`}
                    {b.createdByEmail ? ` · by ${b.createdByEmail}` : ""}
                  </p>
                  {b.status === "failed" && b.errorMessage && (
                    <p className="text-xs text-red-600 mt-0.5">{b.errorMessage}</p>
                  )}
                </div>
                {b.status === "completed" && (
                  <Button variant="ghost" size="sm" onClick={() => handleDownload(b.id)} className="shrink-0">
                    <Download className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
