import { useState, useCallback } from "react";
import { ShieldCheck, Wrench, Webhook, ReceiptText, RefreshCw, Plug, Loader2, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

type Status = "ok" | "blocked" | "partial";

interface TransactionMismatch {
  orderId: number;
  reference: string;
  localStatus: string;
  localAmountKobo: number;
  paystackStatus: string | null;
  paystackAmountKobo: number | null;
  issue: string;
}

interface ActionResult {
  action: string;
  status: Status;
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  detail?: { mismatches?: TransactionMismatch[] };
}

interface ActionDef {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}

const ACTIONS: ActionDef[] = [
  {
    id: "verify-gateway",
    path: "verify-gateway",
    label: "Verify Gateway",
    description: "Checks the secret key, gateway enabled state, Paystack connectivity, and mode. Read-only.",
    icon: ShieldCheck,
  },
  {
    id: "repair-configuration",
    path: "repair-configuration",
    label: "Repair Payment Configuration",
    description: "Resets invalid tax/fee/min/max values or an unsupported currency back to safe defaults. Never touches the secret key or any order.",
    icon: Wrench,
  },
  {
    id: "verify-webhooks",
    path: "verify-webhooks",
    label: "Verify Webhooks",
    description: "Confirms Paystack webhooks are still arriving by checking when the last signature-verified delivery was received.",
    icon: Webhook,
  },
  {
    id: "verify-transactions",
    path: "verify-transactions",
    label: "Verify Transaction Records",
    description: "Cross-checks the most recent orders against Paystack's own record of each transaction and reports mismatches for manual review. Never alters an order or a real Paystack transaction.",
    icon: ReceiptText,
  },
  {
    id: "reload",
    path: "reload",
    label: "Reload Payment Services",
    description: "Clears the cached payment settings and re-reads them fresh from the database.",
    icon: RefreshCw,
  },
  {
    id: "reconnect",
    path: "reconnect",
    label: "Reconnect Payment Gateway",
    description: "Re-applies any rotated System Configuration key and re-tests the Paystack connection — use this right after rotating a key.",
    icon: Plug,
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

export default function PaymentRecoveryPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  const run = useCallback(
    async (action: ActionDef) => {
      setRunning(action.id);
      try {
        const res = await fetch(`${API}/admin/payment-recovery/${action.path}`, { method: "POST", headers: { Authorization: token } });
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
        <h2 className="text-xl font-bold text-foreground">Payment Recovery Centre</h2>
        <p className="text-sm text-muted-foreground mt-1">
          One-click actions to verify and repair the payment gateway. No action here can ever delete a payment,
          order, or transaction record, and none can reverse or alter a real Paystack transaction — transaction
          mismatches are reported for manual review only.
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
                  {result.detail?.mismatches && result.detail.mismatches.length > 0 && (
                    <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                      {result.detail.mismatches.map((m) => (
                        <li key={m.orderId}>
                          Order #{m.orderId} ({m.reference}): {m.issue}
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
