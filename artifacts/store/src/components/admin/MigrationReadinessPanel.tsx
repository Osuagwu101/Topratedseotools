import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface MigrationCategory {
  key: string;
  label: string;
  description: string;
  medium: "postgres" | "object-storage" | "external-saas";
  recordCount: number;
  portable: boolean;
  note: string | null;
}

interface MigrationReadinessReport {
  environment: string;
  generatedAt: string;
  storageBackend: string;
  categories: MigrationCategory[];
  overallPortable: boolean;
  summary: string;
}

interface BackupRow {
  id: number;
  scope: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  environment: string;
}

interface CategoryValidationResult {
  categoryKey: string;
  categoryLabel: string;
  status: "match" | "mismatch" | "unknown";
  detail: string;
  tables: string[];
}

interface MigrationValidationReport {
  backupId: number;
  backupScope: string;
  backupCreatedAt: string;
  crossEnvironment: boolean;
  checkedAt: string;
  categories: CategoryValidationResult[];
  overallStatus: "match" | "mismatch" | "inconclusive";
  warning?: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}

function mediumLabel(m: MigrationCategory["medium"]): string {
  if (m === "postgres") return "Postgres";
  if (m === "object-storage") return "Object Storage";
  return "External SaaS (Clerk)";
}

export default function MigrationReadinessPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<MigrationReadinessReport | null>(null);
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<MigrationValidationReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, backupsRes] = await Promise.all([
        fetch(`${API}/admin/migration-readiness`, { headers: { Authorization: token } }),
        fetch(`${API}/admin/backups`, { headers: { Authorization: token } }),
      ]);
      if (!reportRes.ok) throw new Error(await reportRes.text());
      if (!backupsRes.ok) throw new Error(await backupsRes.text());
      setReport(await reportRes.json());
      const backupList: BackupRow[] = await backupsRes.json();
      const completed = backupList.filter((b) => b.status === "completed");
      setBackups(completed);
      if (completed.length > 0) setSelectedBackupId(completed[0].id);
    } catch (e: unknown) {
      toast({ title: "Failed to load Migration Readiness", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const runValidation = async () => {
    if (!selectedBackupId) return;
    setValidating(true);
    setValidation(null);
    try {
      const res = await fetch(`${API}/admin/migration-readiness/validate/${selectedBackupId}`, {
        method: "POST",
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(await res.text());
      const result: MigrationValidationReport = await res.json();
      setValidation(result);
      const titles: Record<MigrationValidationReport["overallStatus"], string> = {
        match: "Validation passed",
        mismatch: "Mismatches found",
        inconclusive: "Inconclusive — some categories could not be checked",
      };
      const descriptions: Record<MigrationValidationReport["overallStatus"], string> = {
        match: "Every category was checked and matches this backup exactly.",
        mismatch: "One or more categories differ from this backup — review the details below.",
        inconclusive: "No mismatches were found, but at least one category's live data could not be checked — treat this as unverified, not a pass.",
      };
      toast({
        title: titles[result.overallStatus],
        description: descriptions[result.overallStatus],
        variant: result.overallStatus === "match" ? "default" : "destructive",
      });
    } catch (e: unknown) {
      toast({ title: "Validation failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setValidating(false);
    }
  };

  if (loading || !report) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Migration Readiness</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirms every category of business data can move to a plain host (e.g. Hostinger) without loss, and lets you validate a
            backup snapshot against the live database.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div
        className={`flex items-start gap-3 rounded-xl p-4 border ${
          report.overallPortable ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
        }`}
      >
        {report.overallPortable ? (
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div>
          <div className={`font-bold text-sm ${report.overallPortable ? "text-emerald-700" : "text-amber-700"}`}>
            {report.overallPortable ? "Ready to migrate" : "Not fully portable yet"}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{report.summary}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Checked {fmt(report.generatedAt)} · Environment: {report.environment} · Active storage backend: {report.storageBackend}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Business Data Categories</h3>
        <div className="space-y-2">
          {report.categories.map((c) => (
            <div key={c.key} className="border border-gray-100 rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {c.portable ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                  <span className="font-semibold text-foreground text-sm">{c.label}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{mediumLabel(c.medium)}</span>
                </div>
                <span className="text-xs text-muted-foreground">{c.recordCount.toLocaleString()} records</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
              {c.note && (
                <p className={`text-xs mt-1.5 ${c.portable ? "text-muted-foreground/80" : "text-amber-700 font-medium"}`}>{c.note}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Migration Validation</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Pick a completed backup and compare it against the live database, category by category, to confirm nothing was lost. Uses
          the same comparison engine as the Restore Centre's preview — this only reads data, it never changes anything.
        </p>
        {backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed backups yet — create one from the Backups panel first.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={selectedBackupId ?? ""}
                onChange={(e) => setSelectedBackupId(Number(e.target.value))}
              >
                {backups.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id} · {b.scope} · {fmt(b.createdAt)} ({b.environment})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={runValidation} disabled={validating || !selectedBackupId}>
                {validating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                Run Validation
              </Button>
            </div>

            {validation && (
              <div className="space-y-3">
                {validation.crossEnvironment && (
                  <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    This backup was taken in a different environment than the one you're checking against — counts may legitimately
                    differ.
                  </div>
                )}
                {validation.warning && (
                  <div className="flex items-start gap-2 text-xs bg-blue-50 border border-blue-100 rounded-lg p-3 text-blue-900">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {validation.warning}
                  </div>
                )}
                <div
                  className={`rounded-xl border p-3 flex items-center gap-2 ${
                    validation.overallStatus === "match"
                      ? "bg-emerald-50 border-emerald-200"
                      : validation.overallStatus === "inconclusive"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  {validation.overallStatus === "match" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : validation.overallStatus === "inconclusive" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span
                    className={`text-sm font-bold ${
                      validation.overallStatus === "match"
                        ? "text-emerald-700"
                        : validation.overallStatus === "inconclusive"
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {validation.overallStatus === "match"
                      ? "Every category was checked and matches"
                      : validation.overallStatus === "inconclusive"
                        ? "Inconclusive — some categories could not be checked"
                        : "Mismatches found"}
                  </span>
                </div>
                {validation.categories.map((c) => (
                  <div key={c.categoryKey} className="border border-gray-100 rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-2">
                      {c.status === "match" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : c.status === "mismatch" ? (
                        <XCircle className="w-4 h-4 text-red-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span className="font-semibold text-sm text-foreground">{c.categoryLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{c.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
