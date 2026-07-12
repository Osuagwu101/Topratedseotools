import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Loader2, Save } from "lucide-react";

export default function SettingsPanel({ staff }: { staff: StaffUser }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    blogTitle: "Blog",
    blogIntro: "",
    postsPerPage: 10,
    imageOutputFormat: "webp" as "webp" | "avif",
    imageQuality: 80,
    maxImageWidth: 1920,
    autoFilenameCleaning: true,
    autoAltTextSuggestion: false,
    commentsEnabledGlobally: true,
    newsletterEnabled: false,
    rssEnabled: true
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/blog/settings", { credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setForm(data);
      } catch (err: any) {
        toast({ title: "Error fetching settings", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/blog/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Settings saved successfully" });
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
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">Configure global blog behavior and features.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="font-bold gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </Button>
      </div>

      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">General</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Blog Title</label>
              <Input value={form.blogTitle} onChange={e => setForm(f => ({ ...f, blogTitle: e.target.value }))} className="max-w-md" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Blog Intro Text</label>
              <Input value={form.blogIntro} onChange={e => setForm(f => ({ ...f, blogIntro: e.target.value }))} className="max-w-xl" placeholder="A short description shown at the top of the blog index" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Posts Per Page</label>
              <Input type="number" min={1} max={50} value={form.postsPerPage} onChange={e => setForm(f => ({ ...f, postsPerPage: parseInt(e.target.value) || 10 }))} className="max-w-[100px]" />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">Media & Images</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Output Format</label>
              <select 
                className="flex h-10 w-full max-w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={form.imageOutputFormat}
                onChange={e => setForm(f => ({ ...f, imageOutputFormat: e.target.value as "webp"|"avif" }))}
              >
                <option value="webp">WebP (Recommended)</option>
                <option value="avif">AVIF (Smaller, slower)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Image Quality (1-100)</label>
              <Input type="number" min={1} max={100} value={form.imageQuality} onChange={e => setForm(f => ({ ...f, imageQuality: parseInt(e.target.value) || 80 }))} className="max-w-[100px]" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Max Image Width (px)</label>
              <Input type="number" min={800} max={3840} value={form.maxImageWidth} onChange={e => setForm(f => ({ ...f, maxImageWidth: parseInt(e.target.value) || 1920 }))} className="max-w-[150px]" />
            </div>
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
              <div>
                <div className="text-sm font-bold text-foreground">Auto-clean Filenames</div>
                <div className="text-xs text-muted-foreground">Remove spaces and special characters on upload</div>
              </div>
              <Switch checked={form.autoFilenameCleaning} onCheckedChange={(v) => setForm(f => ({ ...f, autoFilenameCleaning: v }))} />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 border-b border-gray-100 pb-2">Features</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
              <div>
                <div className="text-sm font-bold text-foreground">Comments</div>
                <div className="text-xs text-muted-foreground">Enable comments globally (can be overridden per post)</div>
              </div>
              <Switch checked={form.commentsEnabledGlobally} onCheckedChange={(v) => setForm(f => ({ ...f, commentsEnabledGlobally: v }))} />
            </div>
            
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
              <div>
                <div className="text-sm font-bold text-foreground">RSS Feed</div>
                <div className="text-xs text-muted-foreground">Generate /blog/feed.xml automatically</div>
              </div>
              <Switch checked={form.rssEnabled} onCheckedChange={(v) => setForm(f => ({ ...f, rssEnabled: v }))} />
            </div>

            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 max-w-lg">
              <div>
                <div className="text-sm font-bold text-foreground">Newsletter Subscription</div>
                <div className="text-xs text-muted-foreground">Show newsletter opt-in forms</div>
              </div>
              <Switch checked={form.newsletterEnabled} onCheckedChange={(v) => setForm(f => ({ ...f, newsletterEnabled: v }))} />
            </div>
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
