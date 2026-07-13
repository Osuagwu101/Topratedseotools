import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../../BlogAdminPanel";
import { Loader2, Save, Sparkles } from "lucide-react";

const MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini (fastest, cheapest)" },
  { value: "gpt-4o", label: "GPT-4o (higher quality)" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { value: "gpt-4.1", label: "GPT-4.1 (highest quality)" },
];

export default function SeoGeneratorSettingsPanel({ staff }: { staff: StaffUser }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    aiModel: "gpt-4o-mini",
    serpProvider: "" as string,
    serpApiKey: "",
    hasSerpApiKey: false,
    cacheDurationMinutes: 1440,
    perUserDailyLimit: 10,
    monthlyGenerationLimit: 200,
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        aiModel: form.aiModel,
        serpProvider: form.serpProvider || null,
        cacheDurationMinutes: form.cacheDurationMinutes,
        perUserDailyLimit: form.perUserDailyLimit,
        monthlyGenerationLimit: form.monthlyGenerationLimit,
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
            <p className="text-sm text-muted-foreground mt-1">Provider, cost controls, and generation limits.</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="font-bold gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">AI Model</h3>
          <p className="text-xs text-muted-foreground mb-3">Uses the OpenAI API key configured for this project. Article generation always saves as a draft — it is never published automatically.</p>
          <select
            className="flex h-10 w-full max-w-sm items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={form.aiModel}
            onChange={e => setForm(f => ({ ...f, aiModel: e.target.value }))}
          >
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </section>

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
          </div>
          <div className="mt-4 flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
            <div>
              <div className="text-sm font-bold text-foreground">Confirm Before Expensive Operations</div>
              <div className="text-xs text-muted-foreground">Require an explicit confirmation click before generating a full article or regenerating a section.</div>
            </div>
            <Switch checked={form.confirmBeforeExpensiveOps} onCheckedChange={(v) => setForm(f => ({ ...f, confirmBeforeExpensiveOps: v }))} />
          </div>
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200">
        <Button onClick={handleSave} disabled={saving} className="font-bold gap-2 w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
