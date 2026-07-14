import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Wrench, ShoppingBag, Sparkles, Globe, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface MaintenanceModes {
  maintenanceMode: boolean;
  comingSoonMode: boolean;
  readOnlyMode: boolean;
  maintenanceMessage: string | null;
}

interface ActionResult {
  detail: string;
}

async function postAction(token: string, path: string): Promise<ActionResult> {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function ActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  onRun,
}: {
  icon: typeof RefreshCw;
  title: string;
  description: string;
  buttonLabel: string;
  onRun: () => Promise<ActionResult>;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const result = await onRun();
      toast({ title: `${title} complete`, description: result.detail });
    } catch (e: unknown) {
      toast({ title: `${title} failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-white flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="font-semibold text-foreground">{title}</div>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-md">{description}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={run} disabled={running}>
        {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        {buttonLabel}
      </Button>
    </div>
  );
}

function ModeToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border border-gray-100 rounded-xl p-4 bg-white">
      <div>
        <div className="font-semibold text-foreground">{label}</div>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-md">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-gray-200"
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );
}

export default function CacheMaintenancePanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [modes, setModes] = useState<MaintenanceModes | null>(null);
  const [message, setMessage] = useState("");
  const [savingModes, setSavingModes] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadModes = () => {
    setLoading(true);
    fetch(`${API}/admin/maintenance-modes`, { headers: { Authorization: token } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load modes");
        return res.json();
      })
      .then((data: MaintenanceModes) => {
        setModes(data);
        setMessage(data.maintenanceMessage ?? "");
      })
      .catch((e: unknown) => toast({ title: "Failed to load maintenance modes", description: e instanceof Error ? e.message : String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateMode = async (patch: Partial<MaintenanceModes>) => {
    setSavingModes(true);
    try {
      const res = await fetch(`${API}/admin/maintenance-modes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to update" }));
        throw new Error(body.error ?? "Failed to update");
      }
      const updated: MaintenanceModes = await res.json();
      setModes(updated);
      toast({ title: "Storefront mode updated" });
    } catch (e: unknown) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingModes(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Cache & Maintenance</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Clear and rebuild the storefront's in-memory caches, and control full storefront modes.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Cache Actions</h3>
        <div className="space-y-3">
          <ActionCard
            icon={Trash2}
            title="Clear Cache"
            description="Drops every in-memory settings cache (payment, email, referral, storage listing) immediately."
            buttonLabel="Clear"
            onRun={() => postAction(token, "/admin/cache/clear")}
          />
          <ActionCard
            icon={RefreshCw}
            title="Rebuild Cache"
            description="Clears then immediately re-warms every cache from the database, so the next request is instant."
            buttonLabel="Rebuild"
            onRun={() => postAction(token, "/admin/cache/rebuild")}
          />
          <ActionCard
            icon={ShoppingBag}
            title="Refresh Products"
            description="Products are always read live from the database (no cache exists to clear) — this confirms connectivity and reports the current catalog size."
            buttonLabel="Refresh"
            onRun={() => postAction(token, "/admin/cache/refresh-products")}
          />
          <ActionCard
            icon={Sparkles}
            title="Refresh AI Configuration"
            description="AI provider settings are read live — this re-runs the AI health check, useful right after rotating a key."
            buttonLabel="Refresh"
            onRun={() => postAction(token, "/admin/cache/refresh-ai")}
          />
          <ActionCard
            icon={Globe}
            title="Refresh Website"
            description="Clears every cache that feeds the public storefront so admin edits are guaranteed visible on the next page load."
            buttonLabel="Refresh"
            onRun={() => postAction(token, "/admin/cache/refresh-website")}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Storefront Modes</h3>
        {loading || !modes ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Maintenance and Coming Soon show a full-page takeover to every customer (admin pages stay reachable). Read-Only
                keeps browsing open but blocks new checkouts — enforced on the server too, not just the UI.
              </span>
            </div>
            <ModeToggleRow
              label="Maintenance Mode"
              description="Replace the entire public storefront with a maintenance notice."
              checked={modes.maintenanceMode}
              disabled={savingModes}
              onToggle={(next) => updateMode({ maintenanceMode: next })}
            />
            <ModeToggleRow
              label="Coming Soon Mode"
              description="Replace the entire public storefront with a coming-soon notice."
              checked={modes.comingSoonMode}
              disabled={savingModes}
              onToggle={(next) => updateMode({ comingSoonMode: next })}
            />
            <ModeToggleRow
              label="Read-Only Mode"
              description="Browsing stays open, but new orders and payments are rejected."
              checked={modes.readOnlyMode}
              disabled={savingModes}
              onToggle={(next) => updateMode({ readOnlyMode: next })}
            />
            <div className="border border-gray-100 rounded-xl p-4 bg-white">
              <label className="text-sm font-semibold text-foreground block mb-2">Customer-facing message (optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Shown on the Maintenance/Coming Soon screens. Falls back to a generic message if left blank."
                className="w-full text-sm border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                size="sm"
                className="mt-2"
                disabled={savingModes}
                onClick={() => updateMode({ maintenanceMessage: message.trim() || null })}
              >
                {savingModes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Message
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
