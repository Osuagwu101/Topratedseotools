import { useState, useCallback } from "react";
import { Users, ReceiptText, CalendarClock, DownloadCloud, KeyRound, Loader2, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type Status = "ok" | "blocked" | "partial";

interface RepairSummary {
  key: string;
  label: string;
  repairedCount?: number;
  count?: number;
  error?: string;
}

interface ActionResult {
  action: string;
  status: Status;
  message: string;
  after?: {
    totalFindings: number;
    repaired: RepairSummary[];
    blocked: RepairSummary[];
    manualReviewOnly: RepairSummary[];
  };
}

interface ActionDef {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: typeof Users;
}

const ACTIONS: ActionDef[] = [
  {
    id: "verify-users",
    path: "verify-users",
    label: "Verify Users",
    description: "Cross-checks device sessions against orders, entitlements, and assignments, and flags any customer whose store-credit balance has drifted negative. Never touches a customer's device session or identity.",
    icon: Users,
  },
  {
    id: "verify-purchases",
    path: "verify-purchases",
    label: "Verify Purchases",
    description: "Finds orders that paid but never got an entitlement (repaired by creating it), plus coupon redemptions, credit transactions, and referrals pointing at a missing order.",
    icon: ReceiptText,
  },
  {
    id: "verify-subscriptions",
    path: "verify-subscriptions",
    label: "Verify Subscriptions",
    description: "Finds entitlements/assignments still marked active past their expiry (repaired by marking them expired), and entitlements still active despite a refunded/disputed/reversed payment (repaired by revoking).",
    icon: CalendarClock,
  },
  {
    id: "verify-downloads",
    path: "verify-downloads",
    label: "Verify Downloads",
    description: "Finds entitlements whose download/access server no longer exists and relinks them to the product's current default server.",
    icon: DownloadCloud,
  },
  {
    id: "verify-entitlements",
    path: "verify-entitlements",
    label: "Verify Entitlements",
    description: "Finds entitlements/assignments referencing a deleted product, entitlements pointing at a deleted assignment, and duplicate active entitlements/assignments for the same customer (repaired by keeping the longest-lived one). The customer record itself is never deleted.",
    icon: KeyRound,
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

export default function CustomerRecoveryPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  const run = useCallback(
    async (action: ActionDef) => {
      setRunning(action.id);
      try {
        const res = await fetch(`${API}/admin/customer-recovery/${action.path}`, { method: "POST", headers: { Authorization: token } });
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
        <h2 className="text-xl font-bold text-foreground">Customer Recovery Centre</h2>
        <p className="text-sm text-muted-foreground mt-1">
          One-click checks that verify and, where safe, repair broken links in customer-facing data. A customer's
          own record is never deleted — only stale or dangling links between orders, entitlements, assignments, and
          devices are relinked or cleared.
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
                  {result.after && result.after.totalFindings > 0 && (
                    <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                      {result.after.repaired.map((r) => (
                        <li key={`repaired-${r.key}`}>
                          {r.label}: repaired {r.repairedCount}
                        </li>
                      ))}
                      {result.after.blocked.map((r) => (
                        <li key={`blocked-${r.key}`}>
                          {r.label}: blocked — {r.error}
                        </li>
                      ))}
                      {result.after.manualReviewOnly.map((r) => (
                        <li key={`manual-${r.key}`}>
                          {r.label}: {r.count} need manual review
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
