import { useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type ServiceStatus = "healthy" | "warning" | "error";

interface ServiceHealth {
  key: string;
  label: string;
  status: ServiceStatus;
  summary: string;
}

interface SystemHealthReport {
  status: ServiceStatus;
  services: ServiceHealth[];
  checkedAt: string;
}

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === "healthy") return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
  if (status === "warning") return <AlertTriangle className="w-5 h-5 text-amber-600" />;
  return <XCircle className="w-5 h-5 text-red-600" />;
}

function statusBg(status: ServiceStatus): string {
  if (status === "healthy") return "border-emerald-100 bg-emerald-50/40";
  if (status === "warning") return "border-amber-100 bg-amber-50/40";
  return "border-red-100 bg-red-50/40";
}

export default function SystemHealthPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`${API}/admin/system-health`, { headers: { Authorization: token } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load system health");
        return res.json();
      })
      .then(setReport)
      .catch((e: unknown) => toast({ title: "Failed to load system health", description: e instanceof Error ? e.message : String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">System Health Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Live status for every core service the store depends on.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {loading && !report ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
        </div>
      ) : report ? (
        <>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${statusBg(report.status)}`}>
            <StatusIcon status={report.status} />
            <div>
              <div className="font-bold text-foreground capitalize">Overall: {report.status}</div>
              <div className="text-xs text-muted-foreground">Checked {new Date(report.checkedAt).toLocaleString()}</div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {report.services.map((s) => (
              <div key={s.key} className={`rounded-xl border p-4 ${statusBg(s.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{s.label}</span>
                  <StatusIcon status={s.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.summary}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
