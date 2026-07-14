import { useEffect, useState } from "react";
import { Loader2, Save, RotateCcw, Sliders } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface FeatureFlags {
  id: number;
  marketplaceEnabled: boolean;
  aiToolsEnabled: boolean;
  registrationEnabled: boolean;
  loginEnabled: boolean;
  guestCheckoutEnabled: boolean;
  oneClickAuthEnabled: boolean;
  updatedAt: string | null;
}

async function fetchFlags(token: string): Promise<FeatureFlags> {
  const res = await fetch(`${API}/admin/feature-flags`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

interface ToggleDef {
  key: keyof FeatureFlags;
  label: string;
  description: string;
  warning?: string;
}

const TOGGLES: ToggleDef[] = [
  {
    key: "marketplaceEnabled",
    label: "Marketplace",
    description: "Browsing the tool catalog and starting a purchase. When off, customers can't browse or buy new tools.",
  },
  {
    key: "aiToolsEnabled",
    label: "AI Tools",
    description: "Launching tools a customer already owns from their dashboard. When off, existing subscriptions can't be launched.",
  },
  {
    key: "registrationEnabled",
    label: "Registration",
    description: "New account sign-ups. When off, the sign-up page is disabled and existing customers can still log in.",
  },
  {
    key: "loginEnabled",
    label: "Login",
    description: "Signing in to an existing account. When off, the sign-in page is disabled for everyone, including staff logging in via Clerk.",
    warning: "Turning this off blocks all customer logins on the storefront. Super Admin access is separate and unaffected.",
  },
  {
    key: "guestCheckoutEnabled",
    label: "Guest Checkout",
    description: "Reserved for a future guest checkout flow. This toggle is stored but not enforced yet — checkout still requires an account either way.",
  },
  {
    key: "oneClickAuthEnabled",
    label: "One-Click Authentication (global)",
    description: "Global switch for the auto-login proxy used to launch tools. When off, it overrides every individual tool's One-Click Auth setting.",
  },
];

export default function FeatureManagementPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setFlags(await fetchFlags(token));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (p: Partial<FeatureFlags>) => {
    setFlags((prev) => (prev ? { ...prev, ...p } : prev));
    setDirty(true);
  };

  const save = async () => {
    if (!flags) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/feature-flags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          marketplaceEnabled: flags.marketplaceEnabled,
          aiToolsEnabled: flags.aiToolsEnabled,
          registrationEnabled: flags.registrationEnabled,
          loginEnabled: flags.loginEnabled,
          guestCheckoutEnabled: flags.guestCheckoutEnabled,
          oneClickAuthEnabled: flags.oneClickAuthEnabled,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFlags(await res.json());
      setDirty(false);
      toast({ title: "Feature settings saved" });
    } catch (e) {
      toast({ title: "Failed to save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !flags) {
    return (
      <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
        {error || "Failed to load feature settings"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" /> Feature <span className="text-primary">Management</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Module-level switches enforced directly by the storefront — no redeploy needed.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>
            <RotateCcw className="w-3.5 h-3.5 mr-2" /> Reload
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-white" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
        {TOGGLES.map((t) => (
          <div key={t.key} className="p-5 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground">{t.label}</div>
              <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>
              {t.warning && !flags[t.key] && (
                <p className="text-xs text-amber-600 font-semibold mt-2">{t.warning}</p>
              )}
            </div>
            <Switch
              checked={!!flags[t.key]}
              onCheckedChange={(checked) => patch({ [t.key]: checked } as Partial<FeatureFlags>)}
              className="shrink-0 mt-1"
            />
          </div>
        ))}
      </div>

      {flags.updatedAt && (
        <p className="text-xs text-muted-foreground">Last updated {new Date(flags.updatedAt).toLocaleString()}</p>
      )}
    </div>
  );
}
