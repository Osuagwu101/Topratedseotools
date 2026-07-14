import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, GripVertical, Save, Upload, X } from "lucide-react";
import { HOME_ICON_NAMES } from "@/components/home/icon-map";

export type HomeTab = "hero" | "seo" | "popular" | "benefits" | "steps" | "faq" | "sections";

interface SiteSettings {
  heroImageUrl: string | null;
  heroPrimaryButtonText: string;
  heroSecondaryButtonText: string | null;
  heroTrustLine: string | null;
  heroPrimaryButtonLink: string | null;
  heroSecondaryButtonLink: string | null;
  finalCtaHeadline: string | null;
  finalCtaSubtext: string | null;
  finalCtaButtonText: string;
  finalCtaButtonLink: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonicalUrl: string | null;
  seoOgImageUrl: string | null;
  homepageSectionsConfig: string | null;
}

export const HOMEPAGE_SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  trustStrip: "Trust Strip",
  whyChooseUs: "Why Choose Us",
  howItWorks: "How It Works",
  popularTools: "Popular Tools",
  whoItsFor: "Who It's For",
  testimonials: "Testimonials",
  supportCredibility: "Support & Credibility",
  securePayments: "Secure Payments",
  faq: "FAQ",
  finalCta: "Final Call-To-Action",
};

const HOMEPAGE_SECTION_KEYS = Object.keys(HOMEPAGE_SECTION_LABELS);

interface SectionConfigEntry {
  key: string;
  visible: boolean;
}

function parseSectionsConfig(raw: string | null): SectionConfigEntry[] {
  let parsed: SectionConfigEntry[] = [];
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        parsed = data.filter(
          (e): e is SectionConfigEntry =>
            e && typeof e.key === "string" && HOMEPAGE_SECTION_KEYS.includes(e.key),
        );
      }
    } catch {
      // fall through to default order below
    }
  }
  // Ensure every known section is present exactly once, appending any
  // missing ones (e.g. newly added sections) at the end as visible.
  const seen = new Set(parsed.map((e) => e.key));
  for (const key of HOMEPAGE_SECTION_KEYS) {
    if (!seen.has(key)) parsed.push({ key, visible: true });
  }
  return parsed;
}

interface BenefitCard {
  id: number;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
  published: boolean;
}

interface HowItWorksStep {
  id: number;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
  published: boolean;
}

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
  published: boolean;
}

interface ProductLite {
  id: number;
  name: string;
  featuredOrder?: number | null;
  homepageBlurb?: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  "benefit-cards": "benefit card",
  "how-it-works-steps": "step",
  "faq-items": "FAQ item",
};

export default function HomepageAdminPanel({
  token,
  products,
  onProductsChanged,
  activeTab: controlledTab,
  onActiveTabChange,
}: {
  token: string;
  products: ProductLite[];
  onProductsChanged: () => void;
  activeTab?: HomeTab;
  onActiveTabChange?: (tab: HomeTab) => void;
}) {
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const authHeaders = { Authorization: token };
  const API = `${basePath}/api`;
  const [internalTab, setInternalTab] = useState<HomeTab>("hero");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: HomeTab) => {
    if (onActiveTabChange) onActiveTabChange(tab);
    else setInternalTab(tab);
  };
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const heroImageRef = useRef<HTMLInputElement>(null);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);

  const [benefitCards, setBenefitCards] = useState<BenefitCard[]>([]);
  const [benefitForm, setBenefitForm] = useState<Partial<BenefitCard>>({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true });
  const [editingBenefit, setEditingBenefit] = useState<BenefitCard | null>(null);
  const [deleteBenefitId, setDeleteBenefitId] = useState<number | null>(null);

  const [steps, setSteps] = useState<HowItWorksStep[]>([]);
  const [stepForm, setStepForm] = useState<Partial<HowItWorksStep>>({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true });
  const [editingStep, setEditingStep] = useState<HowItWorksStep | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<number | null>(null);

  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [faqForm, setFaqForm] = useState<Partial<FaqItem>>({ question: "", answer: "", published: true });
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [deleteFaqId, setDeleteFaqId] = useState<number | null>(null);

  const [sections, setSections] = useState<SectionConfigEntry[]>(parseSectionsConfig(null));
  const [savingSections, setSavingSections] = useState(false);
  const [sectionDragKey, setSectionDragKey] = useState<string | null>(null);
  const [sectionDragOverKey, setSectionDragOverKey] = useState<string | null>(null);

  const [blurbDrafts, setBlurbDrafts] = useState<Record<number, string>>({});
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [featuredIds, setFeaturedIds] = useState<number[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [reorderingPopular, setReorderingPopular] = useState(false);

  const loadSettings = async () => {
    const res = await fetch(`${API}/admin/site-settings`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load settings");
    const data = await res.json();
    setSettings(data);
    setSections(parseSectionsConfig(data.homepageSectionsConfig));
  };

  const loadBenefitCards = async () => {
    const res = await fetch(`${API}/admin/benefit-cards`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load benefit cards");
    setBenefitCards(await res.json());
  };

  const loadSteps = async () => {
    const res = await fetch(`${API}/admin/how-it-works-steps`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load steps");
    setSteps(await res.json());
  };

  const loadFaq = async () => {
    const res = await fetch(`${API}/admin/faq-items`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load FAQ items");
    setFaqItems(await res.json());
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSettings(), loadBenefitCards(), loadSteps(), loadFaq()]);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load homepage data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const drafts: Record<number, string> = {};
    for (const p of products) {
      drafts[p.id] = p.homepageBlurb ?? "";
    }
    setBlurbDrafts(drafts);
    setFeaturedIds(
      products
        .filter((p) => p.featuredOrder !== null && p.featuredOrder !== undefined)
        .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0))
        .map((p) => p.id),
    );
  }, [products]);

  const saveSettings = async (patch: Partial<SiteSettings>) => {
    const res = await fetch(`${API}/admin/site-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save settings");
    }
    await loadSettings();
    toast({ title: "Saved" });
  };

  const uploadHeroImage = async (file: File) => {
    setUploadingHeroImage(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${API}/admin/site-settings/hero-image`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      await loadSettings();
      toast({ title: "Hero image updated" });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setUploadingHeroImage(false);
    }
  };

  const removeHeroImage = async () => {
    await fetch(`${API}/admin/site-settings/hero-image`, { method: "DELETE", headers: authHeaders });
    await loadSettings();
    toast({ title: "Hero image removed" });
  };

  // ── Generic content resource CRUD helper ────────────────────────────────
  const submitResource = async (
    resource: "benefit-cards" | "how-it-works-steps" | "faq-items",
    body: Record<string, unknown>,
    editingId: number | null,
    reload: () => Promise<void>,
    resetForm: () => void,
    clearEditing: () => void,
  ) => {
    try {
      const url = editingId ? `${API}/admin/${resource}/${editingId}` : `${API}/admin/${resource}`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await reload();
      resetForm();
      clearEditing();
      toast({ title: editingId ? "Updated" : "Added" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : `Failed to save ${RESOURCE_LABELS[resource]}`, variant: "destructive" });
    }
  };

  const deleteResource = async (resource: "benefit-cards" | "how-it-works-steps" | "faq-items", id: number, reload: () => Promise<void>) => {
    await fetch(`${API}/admin/${resource}/${id}`, { method: "DELETE", headers: authHeaders });
    await reload();
    toast({ title: "Deleted" });
  };

  const reorderResource = async (
    resource: "benefit-cards" | "how-it-works-steps" | "faq-items",
    items: { id: number }[],
    id: number,
    direction: "up" | "down",
    reload: () => Promise<void>,
  ) => {
    const idx = items.findIndex((i) => i.id === id);
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= items.length) return;
    const orderedIds = items.map((i) => i.id);
    [orderedIds[idx], orderedIds[swapWith]] = [orderedIds[swapWith], orderedIds[idx]];
    await fetch(`${API}/admin/${resource}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ ids: orderedIds }),
    });
    await reload();
  };

  const saveBlurb = async (productId: number) => {
    const blurb = blurbDrafts[productId] ?? "";
    setSavingProductId(productId);
    try {
      const res = await fetch(`${API}/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ homepageBlurb: blurb.trim() === "" ? null : blurb }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Saved" });
      onProductsChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingProductId(null);
    }
  };

  // Persist the given ordered list of featured product ids: sets sequential
  // featuredOrder for each (drag-and-drop order), and unfeatures anything left out.
  const syncFeaturedOrder = async (orderedIds: number[]) => {
    setReorderingPopular(true);
    try {
      const res = await fetch(`${API}/admin/products/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids: orderedIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      onProductsChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to reorder popular tools", variant: "destructive" });
    } finally {
      setReorderingPopular(false);
    }
  };

  const addToFeatured = (productId: number) => {
    const next = [...featuredIds, productId];
    setFeaturedIds(next);
    syncFeaturedOrder(next);
  };

  const removeFromFeatured = (productId: number) => {
    const next = featuredIds.filter((id) => id !== productId);
    setFeaturedIds(next);
    syncFeaturedOrder(next);
  };

  const handleDrop = (targetId: number) => {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const current = [...featuredIds];
    const fromIdx = current.indexOf(dragId);
    const toIdx = current.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    current.splice(fromIdx, 1);
    current.splice(toIdx, 0, dragId);
    setFeaturedIds(current);
    setDragId(null);
    setDragOverId(null);
    syncFeaturedOrder(current);
  };

  const saveSections = async (next: SectionConfigEntry[]) => {
    setSavingSections(true);
    try {
      await saveSettings({ homepageSectionsConfig: JSON.stringify(next) });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save section order", variant: "destructive" });
    } finally {
      setSavingSections(false);
    }
  };

  const toggleSectionVisible = (key: string) => {
    const next = sections.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s));
    setSections(next);
    saveSections(next);
  };

  const handleSectionDrop = (targetKey: string) => {
    if (sectionDragKey === null || sectionDragKey === targetKey) {
      setSectionDragKey(null);
      setSectionDragOverKey(null);
      return;
    }
    const current = [...sections];
    const fromIdx = current.findIndex((s) => s.key === sectionDragKey);
    const toIdx = current.findIndex((s) => s.key === targetKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = current.splice(fromIdx, 1);
    current.splice(toIdx, 0, moved);
    setSections(current);
    setSectionDragKey(null);
    setSectionDragOverKey(null);
    saveSections(current);
  };

  // ── Section visibility & order tab ──────────────────────────────────────
  const SectionsTab = () => (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold">Homepage Sections</h3>
        {savingSections && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Drag to reorder sections, or hide a section without deleting its content. The Hero always renders first.
      </p>
      <div className="space-y-2">
        {sections.map((s) => {
          const isDragging = sectionDragKey === s.key;
          const isDragOver = sectionDragOverKey === s.key && sectionDragKey !== s.key;
          return (
            <div
              key={s.key}
              draggable
              onDragStart={() => setSectionDragKey(s.key)}
              onDragOver={(e) => {
                e.preventDefault();
                if (sectionDragOverKey !== s.key) setSectionDragOverKey(s.key);
              }}
              onDragEnd={() => {
                setSectionDragKey(null);
                setSectionDragOverKey(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleSectionDrop(s.key);
              }}
              className={`flex items-center gap-3 p-3 border rounded-lg bg-white transition-colors ${
                isDragging ? "opacity-40" : ""
              } ${isDragOver ? "border-primary border-2" : "border-gray-100"}`}
            >
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Drag to reorder ${HOMEPAGE_SECTION_LABELS[s.key]}`}
                title="Drag to reorder"
              >
                <GripVertical className="w-5 h-5" />
              </button>
              <div className={`font-bold flex-1 ${s.visible ? "text-foreground" : "text-muted-foreground"}`}>
                {HOMEPAGE_SECTION_LABELS[s.key]}
                {!s.visible && <span className="ml-2 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Hidden</span>}
              </div>
              <Button size="sm" variant="outline" onClick={() => toggleSectionVisible(s.key)}>
                {s.visible ? "Hide" : "Show"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );

  // ── Hero & CTA tab ───────────────────────────────────────────────────────
  const HeroTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Hero Section</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Primary Button Text</label>
            <Input value={settings?.heroPrimaryButtonText ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroPrimaryButtonText: e.target.value }))} placeholder="Browse Tools" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Primary Button Link (optional)</label>
            <Input value={settings?.heroPrimaryButtonLink ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroPrimaryButtonLink: e.target.value }))} placeholder="/catalog (default if left blank)" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Secondary Button Text (optional)</label>
            <Input value={settings?.heroSecondaryButtonText ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroSecondaryButtonText: e.target.value }))} placeholder="See Popular Tools" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Secondary Button Link (optional)</label>
            <Input value={settings?.heroSecondaryButtonLink ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroSecondaryButtonLink: e.target.value }))} placeholder="#popular-tools (default if left blank)" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Trust Line</label>
            <Input value={settings?.heroTrustLine ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroTrustLine: e.target.value }))} placeholder="Trusted by professionals..." />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Hero Image</label>
            <div className="flex items-center gap-4">
              {settings?.heroImageUrl && (
                <img src={settings.heroImageUrl} alt="Hero" className="h-16 w-24 object-cover rounded-lg border border-gray-100" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={heroImageRef}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadHeroImage(file); e.target.value = ""; }}
              />
              <Button variant="outline" size="sm" disabled={uploadingHeroImage} onClick={() => heroImageRef.current?.click()}>
                {uploadingHeroImage ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Upload className="w-3 h-3 mr-2" />}
                {settings?.heroImageUrl ? "Replace" : "Upload"}
              </Button>
              {settings?.heroImageUrl && (
                <Button variant="ghost" size="sm" className="text-red-500" onClick={removeHeroImage}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSettings({
                  heroPrimaryButtonText: settings?.heroPrimaryButtonText ?? "Browse Tools",
                  heroSecondaryButtonText: settings?.heroSecondaryButtonText ?? null,
                  heroTrustLine: settings?.heroTrustLine ?? null,
                  heroPrimaryButtonLink: settings?.heroPrimaryButtonLink ?? null,
                  heroSecondaryButtonLink: settings?.heroSecondaryButtonLink ?? null,
                })
              }
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> Save Hero
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Final Call-To-Action</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Headline</label>
            <Input value={settings?.finalCtaHeadline ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, finalCtaHeadline: e.target.value }))} placeholder="Ready to get started?" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Subtext</label>
            <Textarea value={settings?.finalCtaSubtext ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, finalCtaSubtext: e.target.value }))} rows={2} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Button Text</label>
            <Input value={settings?.finalCtaButtonText ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, finalCtaButtonText: e.target.value }))} placeholder="Browse Tools" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Button Link (optional)</label>
            <Input value={settings?.finalCtaButtonLink ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, finalCtaButtonLink: e.target.value }))} placeholder="/catalog (default if left blank)" />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSettings({
                  finalCtaHeadline: settings?.finalCtaHeadline ?? null,
                  finalCtaSubtext: settings?.finalCtaSubtext ?? null,
                  finalCtaButtonText: settings?.finalCtaButtonText ?? "Browse Tools",
                  finalCtaButtonLink: settings?.finalCtaButtonLink ?? null,
                })
              }
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> Save CTA
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  // ── SEO tab ──────────────────────────────────────────────────────────────
  const SeoTab = () => (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-4">Homepage SEO</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Page Title</label>
          <Input value={settings?.seoTitle ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, seoTitle: e.target.value }))} placeholder="Top Rated SEO Tools — Affordable Access to Premium Tools" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Meta Description</label>
          <Textarea value={settings?.seoDescription ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, seoDescription: e.target.value }))} rows={3} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Canonical URL</label>
          <Input value={settings?.seoCanonicalUrl ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, seoCanonicalUrl: e.target.value }))} placeholder="https://yourdomain.com" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Social Share Image URL</label>
          <Input value={settings?.seoOgImageUrl ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, seoOgImageUrl: e.target.value }))} placeholder="https://yourdomain.com/og-image.jpg" />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() =>
              saveSettings({
                seoTitle: settings?.seoTitle ?? null,
                seoDescription: settings?.seoDescription ?? null,
                seoCanonicalUrl: settings?.seoCanonicalUrl ?? null,
                seoOgImageUrl: settings?.seoOgImageUrl ?? null,
              })
            }
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Save className="w-4 h-4 mr-2" /> Save SEO
          </Button>
        </div>
      </div>
    </Card>
  );

  // ── Popular tools curation tab ───────────────────────────────────────────
  const PopularToolsTab = () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const featuredProducts = featuredIds.map((id) => byId.get(id)).filter((p): p is ProductLite => !!p);
    const notFeaturedProducts = products.filter((p) => !featuredIds.includes(p.id));

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">Popular Tools</h3>
            {reorderingPopular && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Drag tools to set the order they appear in on the homepage's Popular Tools section. Top of the list appears first.
          </p>

          {featuredProducts.length === 0 && (
            <p className="text-sm text-muted-foreground italic mb-2">No tools featured yet. Add one from the list below.</p>
          )}

          <div className="space-y-2">
            {featuredProducts.map((p) => {
              const blurb = blurbDrafts[p.id] ?? "";
              const isDragging = dragId === p.id;
              const isDragOver = dragOverId === p.id && dragId !== p.id;
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverId !== p.id) setDragOverId(p.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(p.id);
                  }}
                  className={`flex flex-col md:flex-row md:items-center gap-3 p-3 border rounded-lg bg-white transition-colors ${
                    isDragging ? "opacity-40" : ""
                  } ${isDragOver ? "border-primary border-2" : "border-gray-100"}`}
                >
                  <button
                    type="button"
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Drag to reorder ${p.name}`}
                    title="Drag to reorder"
                  >
                    <GripVertical className="w-5 h-5" />
                  </button>
                  <div className="font-bold text-foreground w-full md:w-48 shrink-0">{p.name}</div>
                  <Input
                    className="flex-1"
                    placeholder="Optional homepage blurb"
                    value={blurb}
                    onChange={(e) => setBlurbDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingProductId === p.id}
                      onClick={() => saveBlurb(p.id)}
                    >
                      {savingProductId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save blurb"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      title="Remove from Popular Tools"
                      onClick={() => removeFromFeatured(p.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {notFeaturedProducts.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-2">All Other Tools</h3>
            <p className="text-sm text-muted-foreground mb-4">Add a tool to feature it in the Popular Tools section above.</p>
            <div className="space-y-2">
              {notFeaturedProducts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                  <div className="font-bold text-foreground flex-1">{p.name}</div>
                  <Button size="sm" variant="outline" onClick={() => addToFeatured(p.id)}>
                    <Plus className="w-3 h-3 mr-1" /> Feature on homepage
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  };

  // ── Benefit cards tab ────────────────────────────────────────────────────
  const BenefitsTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">{editingBenefit ? "Edit" : "Add"} Benefit Card</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <select
            className="border border-input rounded-md h-10 px-3 text-sm"
            value={benefitForm.icon}
            onChange={(e) => setBenefitForm((f) => ({ ...f, icon: e.target.value }))}
          >
            {HOME_ICON_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <Input placeholder="Title" value={benefitForm.title ?? ""} onChange={(e) => setBenefitForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <Textarea className="mb-3" placeholder="Description" rows={2} value={benefitForm.description ?? ""} onChange={(e) => setBenefitForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="flex items-center gap-3 mb-4">
          <input id="benefit-published" type="checkbox" checked={benefitForm.published ?? true} onChange={(e) => setBenefitForm((f) => ({ ...f, published: e.target.checked }))} className="w-4 h-4 rounded accent-primary" />
          <label htmlFor="benefit-published" className="text-sm font-medium">Published</label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              submitResource(
                "benefit-cards",
                benefitForm,
                editingBenefit?.id ?? null,
                loadBenefitCards,
                () => setBenefitForm({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true }),
                () => setEditingBenefit(null),
              )
            }
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> {editingBenefit ? "Update" : "Add"}
          </Button>
          {editingBenefit && (
            <Button variant="outline" onClick={() => { setEditingBenefit(null); setBenefitForm({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true }); }}>Cancel</Button>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {benefitCards.map((card) => (
          <Card key={card.id} className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-2">
                {card.title}
                {!card.published && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Hidden</span>}
              </div>
              <div className="text-xs text-muted-foreground">{card.description}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => reorderResource("benefit-cards", benefitCards, card.id, "up", loadBenefitCards)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 -rotate-90" /></button>
              <button onClick={() => reorderResource("benefit-cards", benefitCards, card.id, "down", loadBenefitCards)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 rotate-90" /></button>
              <Button variant="outline" size="sm" onClick={() => { setEditingBenefit(card); setBenefitForm({ ...card }); }}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteBenefitId(card.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!deleteBenefitId} onOpenChange={() => setDeleteBenefitId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete benefit card?</DialogTitle>
            <DialogDescription>This removes it from the homepage.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBenefitId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { if (!deleteBenefitId) return; await deleteResource("benefit-cards", deleteBenefitId, loadBenefitCards); setDeleteBenefitId(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── How it works tab ─────────────────────────────────────────────────────
  const StepsTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">{editingStep ? "Edit" : "Add"} Step</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <select
            className="border border-input rounded-md h-10 px-3 text-sm"
            value={stepForm.icon}
            onChange={(e) => setStepForm((f) => ({ ...f, icon: e.target.value }))}
          >
            {HOME_ICON_NAMES.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <Input placeholder="Title" value={stepForm.title ?? ""} onChange={(e) => setStepForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <Textarea className="mb-3" placeholder="Description" rows={2} value={stepForm.description ?? ""} onChange={(e) => setStepForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="flex items-center gap-3 mb-4">
          <input id="step-published" type="checkbox" checked={stepForm.published ?? true} onChange={(e) => setStepForm((f) => ({ ...f, published: e.target.checked }))} className="w-4 h-4 rounded accent-primary" />
          <label htmlFor="step-published" className="text-sm font-medium">Published</label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              submitResource(
                "how-it-works-steps",
                stepForm,
                editingStep?.id ?? null,
                loadSteps,
                () => setStepForm({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true }),
                () => setEditingStep(null),
              )
            }
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> {editingStep ? "Update" : "Add"}
          </Button>
          {editingStep && (
            <Button variant="outline" onClick={() => { setEditingStep(null); setStepForm({ icon: HOME_ICON_NAMES[0], title: "", description: "", published: true }); }}>Cancel</Button>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {steps.map((step) => (
          <Card key={step.id} className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-2">
                {step.title}
                {!step.published && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Hidden</span>}
              </div>
              <div className="text-xs text-muted-foreground">{step.description}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => reorderResource("how-it-works-steps", steps, step.id, "up", loadSteps)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 -rotate-90" /></button>
              <button onClick={() => reorderResource("how-it-works-steps", steps, step.id, "down", loadSteps)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 rotate-90" /></button>
              <Button variant="outline" size="sm" onClick={() => { setEditingStep(step); setStepForm({ ...step }); }}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteStepId(step.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!deleteStepId} onOpenChange={() => setDeleteStepId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete step?</DialogTitle>
            <DialogDescription>This removes it from the homepage.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteStepId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { if (!deleteStepId) return; await deleteResource("how-it-works-steps", deleteStepId, loadSteps); setDeleteStepId(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── FAQ tab ──────────────────────────────────────────────────────────────
  const FaqTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">{editingFaq ? "Edit" : "Add"} FAQ Item</h3>
        <Input className="mb-3" placeholder="Question" value={faqForm.question ?? ""} onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))} />
        <Textarea className="mb-3" placeholder="Answer" rows={3} value={faqForm.answer ?? ""} onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} />
        <div className="flex items-center gap-3 mb-4">
          <input id="faq-published" type="checkbox" checked={faqForm.published ?? true} onChange={(e) => setFaqForm((f) => ({ ...f, published: e.target.checked }))} className="w-4 h-4 rounded accent-primary" />
          <label htmlFor="faq-published" className="text-sm font-medium">Published</label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              submitResource(
                "faq-items",
                faqForm,
                editingFaq?.id ?? null,
                loadFaq,
                () => setFaqForm({ question: "", answer: "", published: true }),
                () => setEditingFaq(null),
              )
            }
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> {editingFaq ? "Update" : "Add"}
          </Button>
          {editingFaq && (
            <Button variant="outline" onClick={() => { setEditingFaq(null); setFaqForm({ question: "", answer: "", published: true }); }}>Cancel</Button>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {faqItems.map((item) => (
          <Card key={item.id} className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-foreground flex items-center gap-2">
                {item.question}
                {!item.published && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Hidden</span>}
              </div>
              <div className="text-xs text-muted-foreground">{item.answer}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => reorderResource("faq-items", faqItems, item.id, "up", loadFaq)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 -rotate-90" /></button>
              <button onClick={() => reorderResource("faq-items", faqItems, item.id, "down", loadFaq)} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 rotate-90" /></button>
              <Button variant="outline" size="sm" onClick={() => { setEditingFaq(item); setFaqForm({ ...item }); }}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteFaqId(item.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!deleteFaqId} onOpenChange={() => setDeleteFaqId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete FAQ item?</DialogTitle>
            <DialogDescription>This removes it from the homepage.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFaqId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { if (!deleteFaqId) return; await deleteResource("faq-items", deleteFaqId, loadFaq); setDeleteFaqId(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
          Homepage <span className="text-primary">Content</span>
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Edit the hero, popular tools, benefits, how-it-works steps, FAQ, and SEO for the homepage — no deploy required.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HomeTab)}>
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="hero">Hero &amp; CTA</TabsTrigger>
          <TabsTrigger value="popular">Popular Tools</TabsTrigger>
          <TabsTrigger value="benefits">Why Choose Us</TabsTrigger>
          <TabsTrigger value="steps">How It Works</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="sections">Section Order</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="hero"><HeroTab /></TabsContent>
        <TabsContent value="popular"><PopularToolsTab /></TabsContent>
        <TabsContent value="benefits"><BenefitsTab /></TabsContent>
        <TabsContent value="steps"><StepsTab /></TabsContent>
        <TabsContent value="faq"><FaqTab /></TabsContent>
        <TabsContent value="sections"><SectionsTab /></TabsContent>
        <TabsContent value="seo"><SeoTab /></TabsContent>
      </Tabs>
    </div>
  );
}
