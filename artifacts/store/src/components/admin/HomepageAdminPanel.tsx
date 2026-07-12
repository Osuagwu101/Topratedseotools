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

type HomeTab = "hero" | "seo" | "popular" | "benefits" | "steps" | "faq";

interface SiteSettings {
  heroImageUrl: string | null;
  heroPrimaryButtonText: string;
  heroSecondaryButtonText: string | null;
  heroTrustLine: string | null;
  finalCtaHeadline: string | null;
  finalCtaSubtext: string | null;
  finalCtaButtonText: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoCanonicalUrl: string | null;
  seoOgImageUrl: string | null;
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

export default function HomepageAdminPanel({ token, products }: { token: string; products: ProductLite[] }) {
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const authHeaders = { Authorization: token };
  const API = `${basePath}/api`;
  const [activeTab, setActiveTab] = useState<HomeTab>("hero");
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

  const [productDrafts, setProductDrafts] = useState<Record<number, { featuredOrder: string; homepageBlurb: string }>>({});
  const [savingProductId, setSavingProductId] = useState<number | null>(null);

  const loadSettings = async () => {
    const res = await fetch(`${API}/admin/site-settings`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load settings");
    setSettings(await res.json());
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
    const drafts: Record<number, { featuredOrder: string; homepageBlurb: string }> = {};
    for (const p of products) {
      drafts[p.id] = {
        featuredOrder: p.featuredOrder !== null && p.featuredOrder !== undefined ? String(p.featuredOrder) : "",
        homepageBlurb: p.homepageBlurb ?? "",
      };
    }
    setProductDrafts(drafts);
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

  const saveProductFeature = async (productId: number) => {
    const draft = productDrafts[productId];
    if (!draft) return;
    setSavingProductId(productId);
    try {
      const featuredOrder = draft.featuredOrder.trim() === "" ? null : parseInt(draft.featuredOrder, 10);
      const res = await fetch(`${API}/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ featuredOrder, homepageBlurb: draft.homepageBlurb.trim() === "" ? null : draft.homepageBlurb }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Saved" });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingProductId(null);
    }
  };

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
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Secondary Button Text (optional)</label>
            <Input value={settings?.heroSecondaryButtonText ?? ""} onChange={(e) => setSettings((s) => ({ ...s!, heroSecondaryButtonText: e.target.value }))} placeholder="See Popular Tools" />
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
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSettings({
                  finalCtaHeadline: settings?.finalCtaHeadline ?? null,
                  finalCtaSubtext: settings?.finalCtaSubtext ?? null,
                  finalCtaButtonText: settings?.finalCtaButtonText ?? "Browse Tools",
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
  const PopularToolsTab = () => (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-2">Popular Tools</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Set a display order number to feature a tool on the homepage. Leave blank to exclude it. Lower numbers appear first.
      </p>
      <div className="space-y-3">
        {products.map((p) => {
          const draft = productDrafts[p.id] ?? { featuredOrder: "", homepageBlurb: "" };
          return (
            <div key={p.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 border border-gray-100 rounded-lg">
              <div className="font-bold text-foreground w-full md:w-48 shrink-0">{p.name}</div>
              <Input
                type="number"
                className="w-full md:w-32"
                placeholder="Order #"
                value={draft.featuredOrder}
                onChange={(e) => setProductDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], featuredOrder: e.target.value } }))}
              />
              <Input
                className="flex-1"
                placeholder="Optional homepage blurb"
                value={draft.homepageBlurb}
                onChange={(e) => setProductDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], homepageBlurb: e.target.value } }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={savingProductId === p.id}
                onClick={() => saveProductFeature(p.id)}
              >
                {savingProductId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );

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
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="hero"><HeroTab /></TabsContent>
        <TabsContent value="popular"><PopularToolsTab /></TabsContent>
        <TabsContent value="benefits"><BenefitsTab /></TabsContent>
        <TabsContent value="steps"><StepsTab /></TabsContent>
        <TabsContent value="faq"><FaqTab /></TabsContent>
        <TabsContent value="seo"><SeoTab /></TabsContent>
      </Tabs>
    </div>
  );
}
