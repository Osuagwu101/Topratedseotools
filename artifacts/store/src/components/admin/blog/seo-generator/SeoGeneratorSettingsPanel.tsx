import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../../BlogAdminPanel";
import { Loader2, Save, Sparkles, BarChart3, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import LinkInsightsPanel from "./LinkInsightsPanel";

interface DailyCount {
  date: string;
  action: string;
  count: number;
}

interface StaffUsage {
  staffUserId: number;
  staffName: string | null;
  staffEmail: string | null;
  count: number;
  lastUsedAt: string;
}

interface UsageEntry {
  id: number;
  staffUserId: number;
  action: string;
  detail: string | null;
  createdAt: string;
  postId: number | null;
  postTitle: string | null;
  staffName: string | null;
  staffEmail: string | null;
}

interface UsageHistory {
  days: number;
  dailyCounts: DailyCount[];
  byStaff: StaffUsage[];
  recentEntries: UsageEntry[];
  limits: { perUserDailyLimit: number; monthlyGenerationLimit: number; warningThresholdPercent: number; monthCount: number };
}

const ACTION_LABELS: Record<string, string> = {
  research: "Keyword research",
  brief: "Content brief",
  generate_full: "Full article",
  generate_section: "Section generation",
  regenerate_section: "Section regeneration",
};

const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (fastest, cheapest)" },
  { value: "gpt-4o", label: "GPT-4o (higher quality)" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4.1", label: "GPT-4.1 (highest quality)" },
];

const GEMINI_MODELS = [
  { value: "gemini-flash-latest", label: "Gemini Flash (fast, free-tier friendly)" },
  { value: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (fastest, cheapest)" },
  { value: "gemini-pro-latest", label: "Gemini Pro (higher quality, may need billing on free tier)" },
];

export default function SeoGeneratorSettingsPanel({
  staff,
  onStartNewArticle,
  onOpenPost,
}: {
  staff: StaffUser;
  onStartNewArticle: () => void;
  onOpenPost: (postId: number) => void;
}) {
  const { toast } = useToast();
  const isAdmin = staff.role === "administrator";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<UsageHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(isAdmin);
  const [historyDays, setHistoryDays] = useState(30);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    aiProvider: "openai" as string,
    aiModel: "gpt-4o-mini",
    geminiModel: "gemini-flash-latest",
    hasOpenAiKey: false,
    hasGeminiKey: false,
    serpProvider: "" as string,
    serpApiKey: "",
    hasSerpApiKey: false,
    cacheDurationMinutes: 1440,
    perUserDailyLimit: 10,
    monthlyGenerationLimit: 200,
    warningThresholdPercent: 80,
    confirmBeforeExpensiveOps: true,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/blog/seo-generator/settings", { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setForm(f => ({ ...f, ...data, serpProvider: data.serpProvider || "", serpApiKey: "" }));
      } catch (err: any) {
        toast({ title: "Error loading AI generator settings", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    // Usage history / cost export is administrator-only on the backend
    // (it surfaces spend and per-staff activity) -- editors don't have
    // permission to view it, so skip the fetch entirely for them.
    if (!isAdmin) return;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        const res = await fetch(`/api/admin/blog/seo-generator/usage-history?days=${historyDays}`, { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        setHistory(await res.json());
      } catch (err: any) {
        toast({ title: "Error loading usage history", description: err.message, variant: "destructive" });
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [historyDays, isAdmin]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/blog/seo-generator/usage-history/export?days=${historyDays}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameMatch?.[1] ?? `ai-generator-usage-${historyDays}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error exporting usage history", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const chartData = (() => {
    if (!history) return [];
    const byDate = new Map<string, number>();
    for (const row of history.dailyCounts) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.count);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date: date.slice(5), count }));
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        aiProvider: form.aiProvider,
        aiModel: form.aiModel,
        geminiModel: form.geminiModel,
        serpProvider: form.serpProvider || null,
        cacheDurationMinutes: form.cacheDurationMinutes,
        perUserDailyLimit: form.perUserDailyLimit,
        monthlyGenerationLimit: form.monthlyGenerationLimit,
        warningThresholdPercent: form.warningThresholdPercent,
        confirmBeforeExpensiveOps: form.confirmBeforeExpensiveOps,
      };
      if (form.serpApiKey.trim()) payload.serpApiKey = form.serpApiKey.trim();
      const res = await fetch("/api/admin/blog/seo-generator/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setForm(f => ({ ...f, ...data, serpProvider: data.serpProvider || "", serpApiKey: "" }));
      toast({ title: "AI generator settings saved" });
    } catch (err: any) {
      toast({ title: "Error saving settings", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-xl font-heading font-bold text-foreground">AI SEO Article Generator</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isAdmin ? "Provider, cost controls, and generation limits." : "Current AI provider and generation settings."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={onStartNewArticle} className="font-bold gap-2 bg-primary text-white">
            <Sparkles className="w-4 h-4" />
            New AI Article
          </Button>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saving} variant="outline" className="font-bold gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-8">
        Click "New AI Article" above to create a draft post and jump straight into keyword research, a content brief, and full
        article generation.{!isAdmin && " Provider/model, API keys, and cost limits below are read-only for your role — ask an administrator to change them."}
      </p>

      <div className="space-y-8">
        <section>
          <LinkInsightsPanel staff={staff} onOpenPost={onOpenPost} />
        </section>

        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">AI Provider & Model</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Editors can override the provider per-generation (e.g. switch to Gemini if OpenAI credit runs out) — this is just the
            default. Article generation always saves as a draft — it is never published automatically.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Default Provider</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                value={form.aiProvider}
                onChange={e => setForm(f => ({ ...f, aiProvider: e.target.value }))}
                disabled={!isAdmin}
              >
                <option value="openai">OpenAI {form.hasOpenAiKey ? "(key configured)" : "(no key configured)"}</option>
                <option value="gemini">Gemini {form.hasGeminiKey ? "(key configured)" : "(no key configured)"}</option>
              </select>
            </div>
            <div />
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">OpenAI Model</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                value={form.aiModel}
                onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}
                disabled={!isAdmin}
              >
                {OPENAI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Gemini Model</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                value={form.geminiModel}
                onChange={e => setForm(f => ({ ...f, geminiModel: e.target.value }))}
                disabled={!isAdmin}
              >
                {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          {!form.hasOpenAiKey && !form.hasGeminiKey && (
            <p className="text-xs text-red-600 mt-3">Neither OPENAI_API_KEY nor GEMINI_API_KEY is configured — generation will fail until at least one is added.</p>
          )}
        </section>

        {isAdmin && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">SERP Data Provider (optional)</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Enables "People Also Ask", related searches, and competitor length analysis during keyword research. Without a
            provider, research still works using free Google Autocomplete suggestions and AI-generated related keywords — this
            just unlocks the extra signals. SerpApi and SearchAPI.io both offer free monthly tiers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Provider</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.serpProvider}
                onChange={e => setForm(f => ({ ...f, serpProvider: e.target.value }))}
              >
                <option value="">Disabled</option>
                <option value="serpapi">SerpApi</option>
                <option value="searchapi">SearchAPI.io</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                API Key {form.hasSerpApiKey && <span className="text-green-600">(configured)</span>}
              </label>
              <Input
                type="password"
                value={form.serpApiKey}
                onChange={e => setForm(f => ({ ...f, serpApiKey: e.target.value }))}
                placeholder={form.hasSerpApiKey ? "Leave blank to keep existing key" : "Paste API key"}
              />
            </div>
          </div>
        </section>
        )}

        {isAdmin && (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">Cost & Usage Controls</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Per-user Daily Limit</label>
              <Input type="number" min={1} max={200} value={form.perUserDailyLimit} onChange={e => setForm(f => ({ ...f, perUserDailyLimit: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Monthly Site-wide Limit</label>
              <Input type="number" min={1} max={5000} value={form.monthlyGenerationLimit} onChange={e => setForm(f => ({ ...f, monthlyGenerationLimit: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Research Cache (minutes)</label>
              <Input type="number" min={0} max={10080} value={form.cacheDurationMinutes} onChange={e => setForm(f => ({ ...f, cacheDurationMinutes: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Warn At (% of Monthly Cap)</label>
              <Input type="number" min={1} max={100} value={form.warningThresholdPercent} onChange={e => setForm(f => ({ ...f, warningThresholdPercent: parseInt(e.target.value) || 1 }))} />
              <p className="text-xs text-muted-foreground mt-1">Administrators see a banner once usage crosses this percentage of the monthly limit.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
            <div>
              <div className="text-sm font-bold text-foreground">Confirm Before Expensive Operations</div>
              <div className="text-xs text-muted-foreground">Require an explicit confirmation click before generating a full article or regenerating a section.</div>
            </div>
            <Switch checked={form.confirmBeforeExpensiveOps} onCheckedChange={(v) => setForm(f => ({ ...f, confirmBeforeExpensiveOps: v }))} />
          </div>
        </section>
        )}
      </div>

      {isAdmin && (
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Button onClick={handleSave} disabled={saving} className="font-bold gap-2 w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>
      )}

      {isAdmin && (
      <div className="mt-10 pt-8 border-t border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-heading font-bold text-foreground">Usage & Cost History</h3>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="flex h-9 items-center justify-between rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={historyDays}
              onChange={(e) => setHistoryDays(parseInt(e.target.value, 10))}
              aria-label="Date range"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExportCsv}
              disabled={exporting || historyLoading || !history || history.recentEntries.length === 0}
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export CSV
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Generation activity over the last {history?.days ?? historyDays} days, so you can spot spend trends before the monthly cap is hit.
        </p>

        {historyLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !history || history.recentEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-gray-50 border border-gray-100 rounded-lg p-6 text-center">
            No AI generation activity yet.
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg p-4 max-w-lg">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">This Month</div>
                <div className="text-2xl font-heading font-bold text-foreground">
                  {history.limits.monthCount} <span className="text-sm font-normal text-muted-foreground">/ {history.limits.monthlyGenerationLimit} generations</span>
                </div>
              </div>
              <div className={`text-xs font-bold px-2 py-1 rounded ${history.limits.monthCount >= history.limits.monthlyGenerationLimit ? "bg-red-100 text-red-700" : history.limits.monthCount >= history.limits.monthlyGenerationLimit * (history.limits.warningThresholdPercent / 100) ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                {Math.round((history.limits.monthCount / Math.max(1, history.limits.monthlyGenerationLimit)) * 100)}% of cap
              </div>
            </div>

            {chartData.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Daily Generation Volume</h4>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                      <Tooltip />
                      <Bar dataKey="count" name="Generations" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">By Staff Member</h4>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Staff Member</th>
                      <th className="text-right px-4 py-2">Generations</th>
                      <th className="text-right px-4 py-2">Last Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.byStaff.map((row) => (
                      <tr key={row.staffUserId}>
                        <td className="px-4 py-2 font-medium text-foreground">{row.staffName ?? `Staff #${row.staffUserId}`}</td>
                        <td className="px-4 py-2 text-right">{row.count}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{new Date(row.lastUsedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Recent Activity</h4>
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">When</th>
                      <th className="text-left px-4 py-2">Staff Member</th>
                      <th className="text-left px-4 py-2">Action</th>
                      <th className="text-left px-4 py-2">Post</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {history.recentEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-2">{entry.staffName ?? `Staff #${entry.staffUserId}`}</td>
                        <td className="px-4 py-2">{ACTION_LABELS[entry.action] ?? entry.action}</td>
                        <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{entry.postTitle ?? (entry.detail ? entry.detail : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
