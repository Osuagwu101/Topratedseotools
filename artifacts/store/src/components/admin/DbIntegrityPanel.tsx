import { useState, useCallback } from "react";
import { ShieldCheck, PlayCircle, Wrench, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type Category = "missing" | "broken" | "duplicate" | "orphaned" | "invalid_relationship";

interface Finding {
  key: string;
  label: string;
  category: Category;
  table: string;
  description: string;
  count: number;
  sample: Record<string, unknown>[];
  repairable: boolean;
  protectedDataset: string | null;
}

interface Report {
  generatedAt: string;
  totalFindings: number;
  findings: Finding[];
}

const CATEGORY_LABELS: Record<Category, string> = {
  missing: "Missing records",
  broken: "Broken records",
  duplicate: "Duplicates",
  orphaned: "Orphaned records",
  invalid_relationship: "Invalid relationships",
};

const CATEGORY_ORDER: Category[] = ["missing", "broken", "duplicate", "orphaned", "invalid_relationship"];

export default function DbIntegrityPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [report, setReport] = useState<Report | null>(null);
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API}/admin/db-integrity/scan`, { method: "POST", headers: { Authorization: token } });
      if (!res.ok) throw new Error((await res.json()).error || "Scan failed.");
      const data: Report = await res.json();
      setReport(data);
      toast({
        title: data.totalFindings === 0 ? "No issues found" : `Found ${data.totalFindings} issue(s)`,
        description: data.totalFindings === 0 ? "The database looks consistent." : "Review the findings below.",
      });
    } catch (e: unknown) {
      toast({ title: "Scan failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [token, toast]);

  const runRepair = async (finding: Finding) => {
    setRepairing(finding.key);
    try {
      const res = await fetch(`${API}/admin/db-integrity/repair/${finding.key}`, { method: "POST", headers: { Authorization: token } });
      const body = await res.json();
      if (res.status === 423) {
        toast({ title: "Repair blocked", description: body.error, variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(body.error || "Repair failed.");
      toast({ title: "Repair applied", description: `Fixed ${body.repairedCount} row(s).` });
      await runScan();
    } catch (e: unknown) {
      toast({ title: "Repair failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setRepairing(null);
    }
  };

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const grouped = report
    ? CATEGORY_ORDER.map((cat) => ({ cat, items: report.findings.filter((f) => f.category === cat) })).filter((g) => g.items.length > 0)
    : [];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Database Integrity</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Scans for missing, broken, duplicate, orphaned, and mis-linked records across products, orders,
            subscriptions, coupons, and referrals. Only unambiguously safe fixes get a one-click Repair — everything
            else is reported for manual review.
          </p>
        </div>
        <Button onClick={runScan} disabled={scanning}>
          {scanning ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <PlayCircle className="w-4 h-4 mr-1.5" />}
          Run Scan
        </Button>
      </div>

      {!report && !scanning && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border border-gray-100 rounded-xl p-4 bg-white">
          <ShieldCheck className="w-4 h-4" /> No scan has been run yet this session. Click "Run Scan" to check the database.
        </div>
      )}

      {report && (
        <>
          <div
            className={`flex items-center gap-3 rounded-xl p-4 border ${
              report.totalFindings === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
            }`}
          >
            {report.totalFindings === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            )}
            <div>
              <div className={`font-bold text-sm ${report.totalFindings === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                {report.totalFindings === 0 ? "No integrity issues found" : `${report.totalFindings} issue(s) found across ${report.findings.length} check(s)`}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Scanned {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
          </div>

          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">{CATEGORY_LABELS[cat]}</h3>
              <div className="space-y-2">
                {items.map((f) => (
                  <div key={f.key} className="border border-gray-100 rounded-xl bg-white overflow-hidden">
                    <button onClick={() => toggle(f.key)} className="w-full flex items-center justify-between gap-2 p-3 text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        {expanded.has(f.key) ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{f.label}</div>
                          <p className="text-xs text-muted-foreground">{f.table} &middot; {f.count} row(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-muted-foreground">{f.count}</span>
                        {f.repairable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={repairing === f.key}
                            onClick={(e) => {
                              e.stopPropagation();
                              runRepair(f);
                            }}
                          >
                            {repairing === f.key ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Wrench className="w-3.5 h-3.5 mr-1" />}
                            Repair
                          </Button>
                        ) : (
                          <span className="text-[11px] px-2 py-1 rounded-full border border-gray-200 text-muted-foreground">Manual review</span>
                        )}
                      </div>
                    </button>
                    {expanded.has(f.key) && (
                      <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                        {f.protectedDataset && (
                          <p className="text-xs text-amber-700">Repairing this touches protected data — unlock it from the Protected Data centre first if blocked.</p>
                        )}
                        <div className="space-y-1">
                          {f.sample.map((row, i) => (
                            <pre key={i} className="text-[11px] bg-white border border-gray-100 rounded p-2 overflow-x-auto">
                              {JSON.stringify(row)}
                            </pre>
                          ))}
                          {f.count > f.sample.length && (
                            <p className="text-[11px] text-muted-foreground">
                              …and {f.count - f.sample.length} more row(s) not shown.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
