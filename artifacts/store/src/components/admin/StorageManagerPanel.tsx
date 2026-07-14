import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Sparkles, Server, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface StorageObjectInfo {
  key: string;
  sizeBytes: number;
  updatedAt: string | null;
  referenced: boolean;
  contentHash: string | null;
}

interface StorageSummary {
  backend: string;
  totalBytes: number;
  totalFiles: number;
  unusedFiles: number;
  unusedBytes: number;
  objects: StorageObjectInfo[];
  computedAt: string;
}

interface StorageSettings {
  id: number;
  backend: "replit" | "s3" | "local";
  localDir: string;
  s3Bucket: string | null;
  s3Region: string | null;
  s3Endpoint: string | null;
  s3ForcePathStyle: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

const BACKEND_LABELS: Record<StorageSettings["backend"], string> = {
  replit: "Replit-managed bucket",
  s3: "S3-compatible bucket (AWS S3, MinIO, Spaces, etc.)",
  local: "Local disk (this server's filesystem)",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function StorageManagerPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [form, setForm] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = (forceRefresh = false) => {
    setLoading(true);
    fetch(`${API}/admin/storage${forceRefresh ? "?refresh=1" : ""}`, { headers: { Authorization: token } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load storage summary");
        return res.json();
      })
      .then(setSummary)
      .catch((e: unknown) => toast({ title: "Failed to load storage", description: e instanceof Error ? e.message : String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  const loadSettings = () => {
    fetch(`${API}/admin/storage/settings`, { headers: { Authorization: token } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load storage settings");
        return res.json();
      })
      .then((s: StorageSettings) => {
        setSettings(s);
        setForm(s);
      })
      .catch((e: unknown) => toast({ title: "Failed to load storage settings", description: e instanceof Error ? e.message : String(e), variant: "destructive" }));
  };

  useEffect(() => {
    load();
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async () => {
    if (!form) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`${API}/admin/storage/settings`, {
        method: "PUT",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: form.backend,
          localDir: form.localDir,
          s3Bucket: form.s3Bucket,
          s3Region: form.s3Region,
          s3Endpoint: form.s3Endpoint,
          s3ForcePathStyle: form.s3ForcePathStyle,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Failed to save");
      const updated: StorageSettings & { health: { ok: boolean; message: string } } = await res.json();
      setSettings(updated);
      setForm(updated);
      if (updated.health.ok) {
        toast({ title: "Storage settings saved", description: `Verified — new uploads will use "${BACKEND_LABELS[updated.backend]}". Files already stored under the previous backend will NOT be reachable anymore unless you migrate them first.` });
      } else {
        toast({
          title: "Saved, but this backend isn't reachable yet",
          description: `${updated.health.message} Uploads will fail until this is fixed. Existing files under any other backend will not be reachable while this one is active.`,
          variant: "destructive",
        });
      }
      load(true);
    } catch (e: unknown) {
      toast({ title: "Failed to save storage settings", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const runAction = async (key: string, path: string, label: string) => {
    setBusy(key);
    try {
      const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: token } });
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      const detail =
        "deleted" in body ? `Removed ${body.deleted} file(s), freed ${formatBytes(body.freedBytes)}.${body.errors?.length ? ` ${body.errors.length} error(s).` : ""}` : body.detail;
      toast({ title: `${label} complete`, description: detail });
      load(true);
    } catch (e: unknown) {
      toast({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Storage Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">Usage, files, and cleanup for object storage.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {loading && !summary ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Used</div>
              <div className="text-2xl font-bold text-foreground mt-1">{formatBytes(summary.totalBytes)}</div>
            </div>
            <div className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Files</div>
              <div className="text-2xl font-bold text-foreground mt-1">{summary.totalFiles}</div>
            </div>
            <div className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unused Files</div>
              <div className="text-2xl font-bold text-foreground mt-1">{summary.unusedFiles}</div>
            </div>
            <div className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reclaimable</div>
              <div className="text-2xl font-bold text-foreground mt-1">{formatBytes(summary.unusedBytes)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="outline" onClick={() => runAction("clear-cache", "/admin/storage/clear-cache", "Clear Cache")} disabled={busy !== null}>
              {busy === "clear-cache" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Clear Listing Cache
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!confirm(`Delete ${summary.unusedFiles} unused file(s)? This only removes files not referenced anywhere in the store and older than 24 hours — no database records are touched.`)) return;
                runAction("delete-unused", "/admin/storage/delete-unused", "Delete Unused Files");
              }}
              disabled={busy !== null || summary.unusedFiles === 0}
            >
              {busy === "delete-unused" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete Unused Files
            </Button>
            <Button size="sm" variant="outline" onClick={() => runAction("optimize", "/admin/storage/optimize", "Optimize Storage")} disabled={busy !== null}>
              {busy === "optimize" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Optimize (Remove Duplicates)
            </Button>
          </div>

          <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Storage Backend</h3>
              <span className="ml-auto text-xs font-semibold text-foreground bg-gray-100 rounded-full px-2 py-0.5">Active: {summary.backend}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Choose where uploads (logos, product images, blog media, testimonial icons) are stored. Only one backend is active at a
              time — after switching, files already stored under the previous backend will <strong>stop being reachable</strong> from
              this app until you move them to the new backend yourself. Saving will verify the new backend and warn you if it isn't
              reachable yet.
            </p>
            {form && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-muted-foreground space-y-1">
                  Backend
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-foreground"
                    value={form.backend}
                    onChange={(e) => setForm({ ...form, backend: e.target.value as StorageSettings["backend"] })}
                  >
                    {Object.entries(BACKEND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                {form.backend === "local" && (
                  <label className="text-xs font-semibold text-muted-foreground space-y-1">
                    Local directory
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-foreground"
                      value={form.localDir}
                      onChange={(e) => setForm({ ...form, localDir: e.target.value })}
                    />
                  </label>
                )}
                {form.backend === "s3" && (
                  <>
                    <label className="text-xs font-semibold text-muted-foreground space-y-1">
                      Bucket
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-foreground"
                        value={form.s3Bucket ?? ""}
                        onChange={(e) => setForm({ ...form, s3Bucket: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground space-y-1">
                      Region
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-foreground"
                        value={form.s3Region ?? ""}
                        onChange={(e) => setForm({ ...form, s3Region: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground space-y-1">
                      Custom endpoint (optional — leave blank for AWS S3)
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-foreground"
                        placeholder="https://s3.example-provider.com"
                        value={form.s3Endpoint ?? ""}
                        onChange={(e) => setForm({ ...form, s3Endpoint: e.target.value })}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2 mt-5">
                      <input
                        type="checkbox"
                        checked={form.s3ForcePathStyle}
                        onChange={(e) => setForm({ ...form, s3ForcePathStyle: e.target.checked })}
                      />
                      Force path-style URLs (needed for MinIO and some providers)
                    </label>
                    <p className="text-xs text-muted-foreground md:col-span-2">
                      Access key ID and secret are configured separately in the System Configuration Centre, under Infrastructure.
                    </p>
                  </>
                )}
                {form.backend === "replit" && (
                  <p className="text-xs text-muted-foreground md:col-span-2">Uses this workspace's built-in Object Storage bucket. No extra configuration needed here.</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={saveSettings} disabled={savingSettings || !form || (settings ? JSON.stringify(form) === JSON.stringify(settings) : false)}>
                {savingSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Backend Settings
              </Button>
              {settings?.updatedAt && (
                <span className="text-xs text-muted-foreground">Last changed {new Date(settings.updatedAt).toLocaleString()}{settings.updatedByEmail ? ` by ${settings.updatedByEmail}` : ""}</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Files ({summary.objects.length})</h3>
            <div className="border border-gray-100 rounded-xl bg-white overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.objects.map((obj) => (
                    <tr key={obj.key} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[280px]" title={obj.key}>{obj.key}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatBytes(obj.sizeBytes)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{obj.updatedAt ? new Date(obj.updatedAt).toLocaleDateString() : "—"}</td>
                      <td className="px-3 py-2">
                        {obj.referenced ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> In use
                          </span>
                        ) : (
                          <span className="text-amber-700 text-xs font-semibold">Unreferenced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {summary.objects.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No files found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Last scanned {new Date(summary.computedAt).toLocaleString()}</p>
        </>
      ) : null}
    </div>
  );
}
