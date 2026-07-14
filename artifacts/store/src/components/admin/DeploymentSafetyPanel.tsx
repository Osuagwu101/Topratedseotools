import { useEffect, useState } from "react";
import { ServerCog, Lock, Unlock, Info, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface DatasetStatus {
  key: string;
  label: string;
  description: string;
  locked: boolean;
}

interface OperationRiskAssessment {
  key: string;
  label: string;
  description: string;
  affectedDatasets: DatasetStatus[];
  allUnlocked: boolean;
}

interface EnvironmentInfo {
  environment: "development" | "production";
  nodeEnv: string;
  databaseHost: string | null;
  processId: number;
  uptimeSeconds: number;
}

interface DeploymentSafetySummary {
  environment: "development" | "production";
  environmentInfo: EnvironmentInfo;
  protectedDatasets: DatasetStatus[];
  riskyOperations: OperationRiskAssessment[];
  explanation: string;
}

interface LogRow {
  id: number;
  datasetKey: string;
  action: string;
  staffEmail: string | null;
  reason: string | null;
  createdAt: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function DeploymentSafetyPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [summary, setSummary] = useState<DeploymentSafetySummary | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [summaryRes, logRes] = await Promise.all([
          fetch(`${API}/admin/deployment-safety`, { headers: { Authorization: token } }),
          fetch(`${API}/admin/deployment-safety/audit-log`, { headers: { Authorization: token } }),
        ]);
        if (!summaryRes.ok) throw new Error(await summaryRes.text());
        if (!logRes.ok) throw new Error(await logRes.text());
        setSummary(await summaryRes.json());
        setLog(await logRes.json());
      } catch (e: unknown) {
        toast({ title: "Failed to load Deployment Safety", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [token, toast]);

  if (loading || !summary) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  const isProd = summary.environment === "production";

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Deployment Safety</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visibility and a safety gate before risky in-app operations touch business-critical data.
        </p>
      </div>

      <div
        className={`flex items-center gap-3 rounded-xl p-4 border ${
          isProd ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"
        }`}
      >
        <ServerCog className={`w-5 h-5 ${isProd ? "text-red-600" : "text-emerald-600"}`} />
        <div>
          <div className={`font-bold text-sm ${isProd ? "text-red-700" : "text-emerald-700"}`}>
            Current environment: {isProd ? "Production" : "Development"}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isProd
              ? "This is the live, customer-facing environment. Risky actions here affect real customers and real data."
              : "This is the development workspace. Changes here do not affect the published app until it's published."}
          </p>
          {summary.environmentInfo?.databaseHost && (
            <p className="text-[11px] text-muted-foreground/80 mt-1 font-mono">
              Connected database host: {summary.environmentInfo.databaseHost}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-100 rounded-xl p-4">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-blue-900">{summary.explanation}</p>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Protected Data Status</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {summary.protectedDatasets.map((d) => (
            <div key={d.key} className="flex items-center gap-2 border border-gray-100 rounded-lg p-2.5 bg-white text-sm">
              {d.locked ? <Lock className="w-3.5 h-3.5 text-emerald-600" /> : <Unlock className="w-3.5 h-3.5 text-amber-600" />}
              <span className="font-medium text-foreground">{d.label}</span>
              <span className={`ml-auto text-xs font-semibold ${d.locked ? "text-emerald-700" : "text-amber-700"}`}>
                {d.locked ? "Locked" : "Unlocked"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Manage unlocks from the Protected Data centre.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Risky Operations Readiness</h3>
        <p className="text-xs text-muted-foreground mb-3">
          These bulk/import/restore-style actions are gated by Protected Data — some are used by centres shipping in
          later Phase 3 tasks (Restore Manager, Product/Customer Recovery). Each will refuse to run until the
          datasets it touches are unlocked.
        </p>
        <div className="space-y-2">
          {summary.riskyOperations.map((op) => (
            <div key={op.key} className="border border-gray-100 rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-semibold text-sm text-foreground">{op.label}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{op.description}</p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    op.allUnlocked ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {op.allUnlocked ? "Would proceed" : "Would be blocked"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {op.affectedDatasets.map((d) => (
                  <span
                    key={d.key}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      d.locked ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-amber-200 text-amber-700 bg-amber-50"
                    }`}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4" /> Recent Activity
        </h3>
        <div className="space-y-1.5">
          {log.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
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
