import { useEffect, useState } from "react";
import { Lock, Unlock, ShieldAlert, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface DatasetStatus {
  key: string;
  label: string;
  description: string;
  locked: boolean;
  unlockedByEmail: string | null;
  unlockReason: string | null;
  unlockedAt: string | null;
  unlockExpiresAt: string | null;
  relockedAt: string | null;
}

interface UnlockLogRow {
  id: number;
  datasetKey: string;
  action: string;
  staffEmail: string | null;
  staffName: string | null;
  reason: string | null;
  createdAt: string;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function ProtectedDataPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<DatasetStatus[]>([]);
  const [log, setLog] = useState<UnlockLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<DatasetStatus | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [statusesRes, logRes] = await Promise.all([
        fetch(`${API}/admin/protected-data`, { headers: { Authorization: token } }),
        fetch(`${API}/admin/protected-data/unlock-log`, { headers: { Authorization: token } }),
      ]);
      if (!statusesRes.ok) throw new Error(await statusesRes.text());
      if (!logRes.ok) throw new Error(await logRes.text());
      setDatasets(await statusesRes.json());
      setLog(await logRes.json());
    } catch (e: unknown) {
      toast({ title: "Failed to load Protected Data", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitUnlock = async () => {
    if (!unlockTarget || !reason.trim()) return;
    setBusyKey(unlockTarget.key);
    try {
      const res = await fetch(`${API}/admin/protected-data/${unlockTarget.key}/unlock`, {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Failed" }))).error ?? "Failed to unlock");
      toast({ title: "Dataset unlocked", description: `${unlockTarget.label} is unlocked for 30 minutes, or until you relock it.` });
      setUnlockTarget(null);
      setReason("");
      await load();
    } catch (e: unknown) {
      toast({ title: "Unlock failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const relock = async (key: string, label: string) => {
    setBusyKey(key);
    try {
      const res = await fetch(`${API}/admin/protected-data/${key}/relock`, { method: "POST", headers: { Authorization: token } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Failed" }))).error ?? "Failed to relock");
      toast({ title: "Dataset relocked", description: `${label} is protected again.` });
      await load();
    } catch (e: unknown) {
      toast({ title: "Relock failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Protected Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every business-critical dataset is locked by default. Unlocking one requires a reason, is logged, and expires
          automatically after 30 minutes — no destructive action against a locked dataset can proceed until it's unlocked.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {datasets.map((d) => (
            <div key={d.key} className="border border-gray-100 rounded-xl p-4 bg-white flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                {d.locked ? (
                  <Lock className="w-4 h-4 text-emerald-600 mt-0.5" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-600 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-sm text-foreground">{d.label}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>
                  {!d.locked && (
                    <p className="text-xs text-amber-700 mt-1">
                      Unlocked by {d.unlockedByEmail ?? "unknown"} — "{d.unlockReason}". Auto-relocks at {fmt(d.unlockExpiresAt)}.
                    </p>
                  )}
                </div>
              </div>
              <div>
                {d.locked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyKey !== null}
                    onClick={() => {
                      setUnlockTarget(d);
                      setReason("");
                    }}
                  >
                    Unlock
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyKey !== null}
                    onClick={() => relock(d.key, d.label)}
                  >
                    {busyKey === d.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Relock now
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {unlockTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setUnlockTarget(null)}>
          <div className="bg-white rounded-xl p-5 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldAlert className="w-4 h-4 text-amber-600" /> Unlock "{unlockTarget.label}"
            </div>
            <p className="text-sm text-muted-foreground">
              This dataset will be unlocked for 30 minutes. State why you're unlocking it — this is recorded permanently.
            </p>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-2 text-sm min-h-[80px]"
              placeholder="e.g. Repairing a broken product/tool link after a failed import"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setUnlockTarget(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!reason.trim() || busyKey !== null} onClick={submitUnlock}>
                {busyKey === unlockTarget.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirm Unlock
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4" /> Recent Unlock Activity
        </h3>
        <div className="space-y-1.5">
          {log.length === 0 && <p className="text-sm text-muted-foreground">No unlock activity yet.</p>}
          {log.slice(0, 25).map((entry) => (
            <div key={entry.id} className="text-xs text-muted-foreground border border-gray-100 rounded-lg p-2.5 bg-gray-50">
              <span className="font-medium text-foreground">{entry.datasetKey}</span> — {entry.action.replace("_", " ")}
              {entry.staffEmail ? ` by ${entry.staffEmail}` : ""}
              {entry.reason ? ` ("${entry.reason}")` : ""} · {fmt(entry.createdAt)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
