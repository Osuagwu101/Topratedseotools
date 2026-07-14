import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Sparkles, HardDrive, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface StorageObjectInfo {
  bucket: string;
  path: string;
  sizeBytes: number;
  updatedAt: string | null;
  referenced: boolean;
  contentHash: string | null;
}

interface StorageSummary {
  totalBytes: number;
  totalFiles: number;
  unusedFiles: number;
  unusedBytes: number;
  buckets: { bucket: string; label: string; fileCount: number; totalBytes: number }[];
  objects: StorageObjectInfo[];
  computedAt: string;
}

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Buckets</h3>
            <div className="space-y-2">
              {summary.buckets.map((b) => (
                <div key={b.bucket} className="flex items-center justify-between border border-gray-100 rounded-xl p-3 bg-white">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm text-foreground">{b.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{b.fileCount} files · {formatBytes(b.totalBytes)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Files ({summary.objects.length})</h3>
            <div className="border border-gray-100 rounded-xl bg-white overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Path</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.objects.map((obj) => (
                    <tr key={obj.path} className="border-t border-gray-50">
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[280px]" title={obj.path}>{obj.path}</td>
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
