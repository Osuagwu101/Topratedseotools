import { useEffect, useState } from "react";
import { Loader2, Users, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface ReferralSettings {
  id: number;
  enabled: boolean;
  rewardType: "percentage" | "fixed" | "store_credit" | "free_product";
  rewardValue: number;
  rewardProductId: number | null;
  minPurchaseKobo: number;
  campaignStartsAt: string | null;
  campaignEndsAt: string | null;
  maxRewardsPerReferrer: number | null;
}

interface ReferralRecord {
  id: number;
  referrerClerkUserId: string;
  refereeEmail: string | null;
  status: "pending" | "completed" | "rejected";
  rewardKobo: number | null;
  rewardGranted: boolean;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TopReferrer {
  clerkUserId: string;
  completedCount: number;
  totalRewardedKobo: number;
}

interface ReferralsResponse {
  referrals: ReferralRecord[];
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  rejectedReferrals: number;
  totalRewardedKobo: number;
  topReferrers: TopReferrer[];
}

async function fetchSettings(token: string): Promise<ReferralSettings> {
  const res = await fetch(`${API}/admin/referral-settings`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchReferrals(token: string): Promise<ReferralsResponse> {
  const res = await fetch(`${API}/admin/referrals`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const STATUS_STYLES: Record<ReferralRecord["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ReferralsAdminPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, d] = await Promise.all([fetchSettings(token), fetchReferrals(token)]);
      setSettings(s);
      setData(d);
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

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/referral-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          enabled: settings.enabled,
          rewardType: settings.rewardType,
          rewardValue: settings.rewardValue,
          rewardProductId: settings.rewardProductId,
          minPurchaseKobo: settings.minPurchaseKobo,
          campaignStartsAt: settings.campaignStartsAt,
          campaignEndsAt: settings.campaignEndsAt,
          maxRewardsPerReferrer: settings.maxRewardsPerReferrer,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to save");
      toast({ title: "Referral settings saved" });
      await load();
    } catch (e) {
      toast({ title: "Could not save settings", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-heading font-bold uppercase flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> Referral Programme
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Configure rewards and monitor referral activity.</p>
      </div>

      {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

      <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
          <span className="text-sm font-semibold">Referral programme enabled</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Reward Type</label>
            <select
              className="w-full h-10 border border-input rounded-md px-3 text-sm"
              value={settings.rewardType}
              onChange={(e) => setSettings({ ...settings, rewardType: e.target.value as ReferralSettings["rewardType"] })}
            >
              <option value="percentage">Percentage of order (as credit)</option>
              <option value="fixed">Fixed amount (as credit)</option>
              <option value="store_credit">Store credit (fixed)</option>
              <option value="free_product">Free product entitlement</option>
            </select>
          </div>
          {settings.rewardType !== "free_product" ? (
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">
                {settings.rewardType === "percentage" ? "Reward Percent" : "Reward Amount (₦)"}
              </label>
              <Input
                type="number"
                value={settings.rewardType === "percentage" ? settings.rewardValue : settings.rewardValue / 100}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    rewardValue:
                      settings.rewardType === "percentage" ? Number(e.target.value) : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground">Reward Product ID</label>
              <Input
                type="number"
                value={settings.rewardProductId ?? ""}
                onChange={(e) => setSettings({ ...settings, rewardProductId: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Min Purchase to Qualify (₦)</label>
            <Input
              type="number"
              value={settings.minPurchaseKobo / 100}
              onChange={(e) => setSettings({ ...settings, minPurchaseKobo: Math.round(Number(e.target.value) * 100) })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Max Rewards per Referrer</label>
            <Input
              type="number"
              value={settings.maxRewardsPerReferrer ?? ""}
              onChange={(e) => setSettings({ ...settings, maxRewardsPerReferrer: e.target.value ? Number(e.target.value) : null })}
              placeholder="Unlimited"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Campaign Start (optional)</label>
            <Input
              type="date"
              value={settings.campaignStartsAt ? settings.campaignStartsAt.slice(0, 10) : ""}
              onChange={(e) => setSettings({ ...settings, campaignStartsAt: e.target.value || null })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-muted-foreground">Campaign End (optional)</label>
            <Input
              type="date"
              value={settings.campaignEndsAt ? settings.campaignEndsAt.slice(0, 10) : ""}
              onChange={(e) => setSettings({ ...settings, campaignEndsAt: e.target.value || null })}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
        </Button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <div className="text-2xl font-heading text-primary">{data.totalReferrals}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground">Total</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <div className="text-2xl font-heading text-primary">{data.completedReferrals}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground">Completed</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <div className="text-2xl font-heading text-primary">{data.pendingReferrals}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground">Pending</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
              <div className="text-2xl font-heading text-primary">₦{(data.totalRewardedKobo / 100).toLocaleString()}</div>
              <div className="text-xs uppercase font-bold text-muted-foreground">Rewarded</div>
            </div>
          </div>

          {data.topReferrers.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <h2 className="text-lg font-heading font-bold uppercase mb-4">Top Referrers</h2>
              <div className="space-y-2">
                {data.topReferrers.map((r) => (
                  <div key={r.clerkUserId} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span className="font-mono truncate">{r.clerkUserId}</span>
                    <span>{r.completedCount} completed · ₦{(r.totalRewardedKobo / 100).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <h2 className="text-lg font-heading font-bold uppercase mb-4">All Referrals</h2>
            {data.referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrals yet.</p>
            ) : (
              <div className="space-y-2">
                {data.referrals.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{r.refereeEmail ?? r.id}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.rewardGranted && r.rewardKobo != null && (
                        <span className="text-xs font-bold text-primary">₦{(r.rewardKobo / 100).toLocaleString()}</span>
                      )}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
