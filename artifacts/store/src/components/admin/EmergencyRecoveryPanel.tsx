import { useState } from "react";
import { Loader2, ShieldCheck, RotateCcw, Wrench, Plug, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

const VERIFIABLE_SERVICES: { key: string; label: string }[] = [
  { key: "payment", label: "Payment Gateway" },
  { key: "authentication", label: "Authentication" },
  { key: "ai", label: "AI Services" },
  { key: "email", label: "Email Service" },
];

interface RecoveryResult {
  ok?: boolean;
  detail?: string;
  status?: string;
}

export default function EmergencyRecoveryPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<Record<string, RecoveryResult>>({});

  const run = async (key: string, path: string, label: string) => {
    setBusy(key);
    try {
      const res = await fetch(`${API}${path}`, { method: "POST", headers: { Authorization: token } });
      if (!res.ok) throw new Error(await res.text());
      const body: RecoveryResult = await res.json();
      setLastResults((prev) => ({ ...prev, [key]: body }));
      const detail = body.detail ?? (body.status ? `Overall status: ${body.status}` : "Done.");
      toast({ title: `${label} complete`, description: detail, variant: body.ok === false ? "destructive" : undefined });
    } catch (e: unknown) {
      toast({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Emergency Recovery Centre</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configuration and connectivity repair tools. Every action here is read/cache/config-only — products, customers,
          orders, and subscriptions are never touched.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" /> Verify All Services
          </div>
          <p className="text-sm text-muted-foreground">Runs the full System Health check across every service right now.</p>
          <Button size="sm" variant="outline" onClick={() => run("verify-all", "/admin/recovery/verify-all", "Verify All Services")} disabled={busy !== null}>
            {busy === "verify-all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Run
          </Button>
        </div>

        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <RotateCcw className="w-4 h-4 text-primary" /> Reload Configuration
          </div>
          <p className="text-sm text-muted-foreground">Re-applies every stored System Configuration value to the running server.</p>
          <Button size="sm" variant="outline" onClick={() => run("reload-configuration", "/admin/recovery/reload-configuration", "Reload Configuration")} disabled={busy !== null}>
            {busy === "reload-configuration" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Run
          </Button>
        </div>

        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Wrench className="w-4 h-4 text-primary" /> Repair Configuration
          </div>
          <p className="text-sm text-muted-foreground">Reloads configuration, rebuilds every cache, then reports what's still broken.</p>
          <Button size="sm" variant="outline" onClick={() => run("repair-configuration", "/admin/recovery/repair-configuration", "Repair Configuration")} disabled={busy !== null}>
            {busy === "repair-configuration" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Run
          </Button>
        </div>

        <div className="border border-gray-100 rounded-xl p-4 bg-white space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Plug className="w-4 h-4 text-primary" /> Refresh API Connections
          </div>
          <p className="text-sm text-muted-foreground">Clears cached credentials and re-pings Paystack, Clerk, AI, and Email right away.</p>
          <Button size="sm" variant="outline" onClick={() => run("refresh-connections", "/admin/recovery/refresh-connections", "Refresh API Connections")} disabled={busy !== null}>
            {busy === "refresh-connections" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Run
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Verify a Single Service</h3>
        <div className="space-y-2">
          {VERIFIABLE_SERVICES.map((s) => {
            const result = lastResults[`verify-${s.key}`];
            return (
              <div key={s.key} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3 bg-white flex-wrap">
                <div>
                  <span className="font-medium text-sm text-foreground">{s.label}</span>
                  {result && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      {result.ok ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                      {result.detail}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(`verify-${s.key}`, `/admin/recovery/verify/${s.key}`, `Verify ${s.label}`)}
                  disabled={busy !== null}
                >
                  {busy === `verify-${s.key}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Verify
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-gray-50 border border-gray-100 rounded-lg p-3">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          If a service still reports an error after Repair Configuration, the underlying credential or provider account
          needs attention — this tool can retry connections but cannot fix an invalid or revoked API key.
        </span>
      </div>
    </div>
  );
}
