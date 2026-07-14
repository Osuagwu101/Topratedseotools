import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Info, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type Severity = "ok" | "warning" | "error" | "info";

interface AuthMethodStatus {
  key: string;
  label: string;
  severity: Severity;
  message: string;
  managedExternally: boolean;
}

interface AuthHealth {
  status: "healthy" | "warning" | "error";
  checks: AuthMethodStatus[];
  checkedAt: string;
}

async function fetchAuthHealth(token: string): Promise<AuthHealth> {
  const res = await fetch(`${API}/admin/auth-manager`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" /> Healthy
      </span>
    );
  }
  if (severity === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">
        <AlertTriangle className="w-3 h-3" /> Warning
      </span>
    );
  }
  if (severity === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-0.5">
        <XCircle className="w-3 h-3" /> Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-0.5">
      <Info className="w-3 h-3" /> Info
    </span>
  );
}

export default function AuthenticationManagerPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [health, setHealth] = useState<AuthHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAuthHealth(token)
      .then(setHealth)
      .catch((e: unknown) => toast({ title: "Failed to load authentication status", description: e instanceof Error ? e.message : String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Authentication Manager</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visibility into every sign-in method the store offers, plus real health checks for the ones this app controls.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {loading && !health ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : health ? (
        <div className="space-y-3">
          {health.checks.map((check) => (
            <div key={check.key} className="border border-gray-100 rounded-xl p-4 bg-white">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-semibold text-foreground">{check.label}</div>
                  <p className="text-sm text-muted-foreground mt-1 max-w-lg">{check.message}</p>
                  {check.managedExternally && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Configured from the workspace's Auth pane, not from this dashboard.
                    </p>
                  )}
                </div>
                <SeverityBadge severity={check.severity} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">Last checked {new Date(health.checkedAt).toLocaleString()}</p>
        </div>
      ) : null}
    </div>
  );
}
