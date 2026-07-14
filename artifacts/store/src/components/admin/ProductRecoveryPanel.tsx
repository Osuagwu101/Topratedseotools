import { useState, useCallback } from "react";
import {
  RefreshCw,
  PackageSearch,
  ListTree,
  ShieldCheck,
  Wrench,
  Database,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type Status = "ok" | "blocked" | "partial";

interface ActionResult {
  action: string;
  status: Status;
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  detail?: Record<string, unknown>;
  report?: { totalFindings: number; findings: { key: string; label: string; count: number }[] };
}

interface ActionDef {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: typeof RefreshCw;
}

const ACTIONS: ActionDef[] = [
  {
    id: "reload",
    path: "reload",
    label: "Reload Products",
    description: "Re-reads the catalog directly from the database and reports its current shape (visible / hidden / soft-deleted, by category).",
    icon: RefreshCw,
  },
  {
    id: "restore-missing",
    path: "restore-missing",
    label: "Restore Missing Products",
    description: "Finds product ids referenced by orders, entitlements, tool servers/assignments, reviews, coupons, blog CTAs, or referral rewards that no longer exist, and reinserts them from the most recent Products backup. Never touches orders or purchases.",
    icon: PackageSearch,
  },
  {
    id: "rebuild-index",
    path: "rebuild-index",
    label: "Rebuild Product Index",
    description: "Normalizes each product's cross-sell/up-sell/down-sell arrays — removes duplicate entries and self-references.",
    icon: ListTree,
  },
  {
    id: "verify",
    path: "verify",
    label: "Verify Product Database",
    description: "Runs the Database Integrity Checker's product-related checks (orders, tool servers/assignments, entitlements, coupons, usage). Read-only.",
    icon: ShieldCheck,
  },
  {
    id: "repair-relationships",
    path: "repair-relationships",
    label: "Repair Product Relationships",
    description: "Strips dead product ids out of recommendation arrays and coupon product-scoping. Never deletes a product, order, or entitlement.",
    icon: Wrench,
  },
  {
    id: "refresh-cache",
    path: "refresh-cache",
    label: "Refresh Product Cache",
    description: "Confirms there's no stale cached product data — the storefront always reads the catalog live.",
    icon: Database,
  },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" /> OK
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
        <Lock className="w-3.5 h-3.5" /> Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <AlertTriangle className="w-3.5 h-3.5" /> Partial
    </span>
  );
}

export default function ProductRecoveryPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  const run = useCallback(
    async (action: ActionDef) => {
      setRunning(action.id);
      try {
        const res = await fetch(`${API}/admin/product-recovery/${action.path}`, { method: "POST", headers: { Authorization: token } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `${action.label} failed.`);
        setResults((prev) => ({ ...prev, [action.id]: body as ActionResult }));
        const status: Status = body.status ?? "ok";
        toast({
          title: action.label,
          description: body.message,
          variant: status === "ok" ? "default" : "destructive",
        });
      } catch (e: unknown) {
        toast({ title: `${action.label} failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      } finally {
        setRunning(null);
      }
    },
    [token, toast],
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Product Recovery Centre</h2>
        <p className="text-sm text-muted-foreground mt-1">
          One-click actions to verify and repair the product catalog. Every action is safe and idempotent, logs a
          before/after summary, and never deletes or alters existing orders or purchases tied to a product.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const result = results[action.id];
          const isRunning = running === action.id;
          return (
            <div key={action.id} className="border border-gray-100 rounded-xl bg-white p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{action.label}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  </div>
                </div>
              </div>

              <Button size="sm" variant="outline" disabled={isRunning} onClick={() => run(action)} className="self-start">
                {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Icon className="w-3.5 h-3.5 mr-1.5" />}
                Run
              </Button>

              {result && (
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={result.status} />
                  </div>
                  <p className="text-xs text-foreground">{result.message}</p>
                  {result.report && result.report.totalFindings > 0 && (
                    <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                      {result.report.findings.map((f) => (
                        <li key={f.key}>
                          {f.label}: {f.count}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
