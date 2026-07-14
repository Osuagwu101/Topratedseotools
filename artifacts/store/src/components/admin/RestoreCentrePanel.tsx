import { useEffect, useState, useCallback } from "react";
import { HistoryIcon, RefreshCw, Loader2, ShieldAlert, CheckCircle2, XCircle, Lock, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface RestorableBackup {
  id: number;
  type: string;
  scope: string;
  scopeLabel: string;
  status: string;
  sizeBytes: number | null;
  environment: string;
  trigger: string;
  createdByEmail: string | null;
  affectedDatasets: string[];
  createdAt: string;
}

interface TableDiff {
  table: string;
  currentCount: number;
  backupCount: number;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
}

interface RestorePreview {
  scope: string;
  backupId: number;
  backupCreatedAt: string;
  backupEnvironment: string;
  currentEnvironment: string;
  crossEnvironment: boolean;
  kind: "tables" | "downloads" | "sql";
  tableDiffs?: TableDiff[];
  downloadsDiff?: { willRestore: number; unchanged: number; totalInBackup: number };
  sqlSummary?: { table: string; backupRowCount: number; currentRowCount: number | null }[];
  warning?: string;
}

interface RestoreHistoryRow {
  id: number;
  backupId: number;
  scope: string;
  status: "running" | "completed" | "failed" | "blocked";
  errorMessage: string | null;
  crossEnvironment: string | null;
  preRestoreBackupId: number | null;
  requestedByEmail: string | null;
  createdAt: string;
  completedAt: string | null;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function RestoreCentrePanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [backups, setBackups] = useState<RestorableBackup[]>([]);
  const [history, setHistory] = useState<RestoreHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmCrossEnv, setConfirmCrossEnv] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [backupsRes, historyRes] = await Promise.all([
        fetch(`${API}/admin/restores/backups`, { headers: { Authorization: token } }),
        fetch(`${API}/admin/restores/history`, { headers: { Authorization: token } }),
      ]);
      if (!backupsRes.ok) throw new Error(await backupsRes.text());
      if (!historyRes.ok) throw new Error(await historyRes.text());
      setBackups(await backupsRes.json());
      setHistory(await historyRes.json());
    } catch (e: unknown) {
      toast({ title: "Failed to load Restore Centre", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = async (backupId: number) => {
    setSelectedId(backupId);
    setPreview(null);
    setConfirming(false);
    setConfirmCrossEnv(false);
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API}/admin/restores/${backupId}/preview`, { headers: { Authorization: token } });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to compute preview.");
      setPreview(await res.json());
    } catch (e: unknown) {
      toast({ title: "Preview failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      setSelectedId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedId) return;
    setRestoring(true);
    try {
      const res = await fetch(`${API}/admin/restores/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ confirm: true, confirmCrossEnvironment: confirmCrossEnv }),
      });
      const body = await res.json();
      if (res.status === 423) {
        toast({ title: "Restore blocked", description: body.error, variant: "destructive" });
      } else if (!res.ok) {
        throw new Error(body.error || "Restore failed.");
      } else {
        toast({ title: "Restore completed", description: `A safety backup (#${body.preRestoreBackupId}) was taken first.` });
        setSelectedId(null);
        setPreview(null);
        setConfirming(false);
      }
      await load();
    } catch (e: unknown) {
      toast({ title: "Restore failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Restore Centre</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Restore business data from a backup. Every restore previews its impact, is blocked while its data is
          protected/locked, and takes a fresh safety backup immediately before applying.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Available Backups</h3>
          <button onClick={() => load()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed backups yet — create one from the Backups centre first.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelect(b.id)}
                className={`w-full text-left border rounded-xl p-3 bg-white transition ${
                  selectedId === b.id ? "border-primary ring-1 ring-primary" : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-foreground capitalize">{b.scopeLabel}</div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 text-muted-foreground">{b.environment}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Backup #{b.id} · {fmt(b.createdAt)} · {b.trigger === "manual" ? "Manual" : `Auto (${b.trigger})`}
                  {b.createdByEmail ? ` · by ${b.createdByEmail}` : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Restore Preview — Backup #{selectedId}</h3>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Computing preview…
            </div>
          ) : preview ? (
            <>
              {preview.crossEnvironment && (
                <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                  <ArrowRightLeft className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-red-800">
                    This backup was taken in <strong>{preview.backupEnvironment}</strong> but you're restoring into{" "}
                    <strong>{preview.currentEnvironment}</strong>. This is an unusual, explicitly-confirmed action — double-check
                    before proceeding.
                  </p>
                </div>
              )}
              {preview.warning && (
                <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-amber-800">{preview.warning}</p>
                </div>
              )}

              {preview.kind === "tables" && preview.tableDiffs && (
                <div className="space-y-1.5">
                  {preview.tableDiffs.map((d) => (
                    <div key={d.table} className="text-sm border border-gray-100 rounded-lg p-2.5 bg-gray-50">
                      <span className="font-medium text-foreground">{d.table}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        — {d.added} added, {d.changed} changed, {d.removed} removed, {d.unchanged} unchanged (backup has {d.backupCount}
                        , currently {d.currentCount})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {preview.kind === "downloads" && preview.downloadsDiff && (
                <p className="text-sm text-foreground">
                  {preview.downloadsDiff.willRestore} file(s) will be added/overwritten, {preview.downloadsDiff.unchanged} already
                  match ({preview.downloadsDiff.totalInBackup} total in backup). No existing files will be deleted.
                </p>
              )}

              {preview.kind === "sql" && preview.sqlSummary && (
                <div className="space-y-1.5">
                  {preview.sqlSummary.map((s) => (
                    <div key={s.table} className="text-sm border border-gray-100 rounded-lg p-2.5 bg-gray-50">
                      <span className="font-medium text-foreground">{s.table}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        — backup has {s.backupRowCount} row(s){s.currentRowCount !== null ? `, currently ${s.currentRowCount}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!confirming ? (
                <Button variant="destructive" onClick={() => setConfirming(true)}>
                  Restore this backup…
                </Button>
              ) : (
                <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-3">
                  <p className="text-sm text-red-800 font-medium">
                    This will replace current data with backup #{selectedId}. A fresh safety backup is taken automatically right
                    before this runs. This cannot be undone from here except by restoring that safety backup.
                  </p>
                  {preview.crossEnvironment && (
                    <label className="flex items-center gap-2 text-sm text-red-800">
                      <input type="checkbox" checked={confirmCrossEnv} onChange={(e) => setConfirmCrossEnv(e.target.checked)} />
                      I understand this restores {preview.backupEnvironment} data into {preview.currentEnvironment} and want to
                      proceed anyway.
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={restoring || (preview.crossEnvironment && !confirmCrossEnv)}
                      onClick={handleRestore}
                    >
                      {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Lock className="w-4 h-4 mr-1.5" />}
                      Confirm restore
                    </Button>
                    <Button variant="outline" onClick={() => setConfirming(false)} disabled={restoring}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <HistoryIcon className="w-4 h-4" /> Restore History
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No restores yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((r) => (
              <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-white flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {r.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  {r.status === "failed" && <XCircle className="w-4 h-4 text-red-600" />}
                  {r.status === "blocked" && <Lock className="w-4 h-4 text-amber-600" />}
                  {r.status === "running" && <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground capitalize">
                    Restore from backup #{r.backupId} <span className="text-xs font-normal text-muted-foreground">({r.scope})</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmt(r.createdAt)}
                    {r.requestedByEmail ? ` · by ${r.requestedByEmail}` : ""}
                    {r.preRestoreBackupId ? ` · safety backup #${r.preRestoreBackupId}` : ""}
                  </p>
                  {r.errorMessage && <p className="text-xs text-red-600 mt-0.5">{r.errorMessage}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
