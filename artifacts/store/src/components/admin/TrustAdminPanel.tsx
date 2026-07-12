import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Star, Save, Loader2, Plus, Trash2, GripVertical, Eye, EyeOff, MessageSquareReply, ShieldCheck, AlertTriangle, RefreshCw, Upload, X } from "lucide-react";

type Tab = "contact" | "support" | "whatsapp" | "testimonials" | "reviews" | "counter" | "payments";

interface Testimonial {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  text: string;
  rating: number | null;
  published: boolean;
  sortOrder: number;
  isSample: boolean;
  permissionObtained: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Review {
  id: number;
  clerkUserId: string;
  orderId: number;
  productId: number;
  productName?: string;
  rating: number;
  title: string | null;
  text: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  verified: boolean;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
}

interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  iconUrl: string | null;
  altText: string | null;
  enabled: boolean;
  sortOrder: number;
  isAutoDetected: boolean;
  provider: string;
}

interface CounterData {
  baseline: number;
  manualCorrection: number;
  liveCount: number;
  displayedTotal: number;
  countingMethod: string;
  lastUpdatedAt: string | null;
  audits: { id: number; previousTotal: number; newTotal: number; reason: string; correctedBy: string; createdAt: string }[];
}

interface SiteSettings {
  businessEmail: string | null;
  businessEmailPublic: boolean;
  businessEmailClickable: boolean;
  whatsappNumber: string | null;
  whatsappMessage: string | null;
  whatsappEnabled: boolean;
  paymentIconsEnabled: boolean;
  supportPageMessage: string | null;
  testimonialsEnabled: boolean;
  customersServedBaseline: number;
  customersServedCountingMethod: string;
  customersServedManualCorrection: number;
}

export default function TrustAdminPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const authHeaders = { Authorization: token };
  const [activeTab, setActiveTab] = useState<Tab>("contact");
  const [loading, setLoading] = useState(false);

  // Contact + WhatsApp + counter settings
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  // Testimonials
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [testimonialForm, setTestimonialForm] = useState<Partial<Testimonial>>({ displayName: "", jobTitle: "", text: "", rating: 5, published: false, permissionObtained: false });
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [deleteTestimonialId, setDeleteTestimonialId] = useState<number | null>(null);
  const testimonialAvatarRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatarFor, setUploadingAvatarFor] = useState<number | null>(null);

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewFilter, setReviewFilter] = useState({ status: "", productId: "", rating: "" });
  const [replyReview, setReplyReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState("");
  const [deleteReviewId, setDeleteReviewId] = useState<number | null>(null);

  // Counter
  const [counter, setCounter] = useState<CounterData | null>(null);
  const [counterForm, setCounterForm] = useState({ baseline: 100, manualCorrection: 0, countingMethod: "unique_customers", reason: "" });

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentForm, setPaymentForm] = useState<Partial<PaymentMethod>>({ name: "", code: "", altText: "", iconUrl: "", enabled: true, provider: "paystack" });
  const [editingPayment, setEditingPayment] = useState<PaymentMethod | null>(null);
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);
  const paymentIconRef = useRef<HTMLInputElement>(null);
  const [uploadingIconFor, setUploadingIconFor] = useState<number | null>(null);

  const API = `${basePath}/api`;

  const loadSettings = async () => {
    const res = await fetch(`${API}/admin/site-settings`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load settings");
    const data = await res.json();
    setSettings(data);
    setCounterForm((f) => ({
      ...f,
      baseline: data.customersServedBaseline,
      manualCorrection: data.customersServedManualCorrection,
      countingMethod: data.customersServedCountingMethod,
    }));
  };

  const loadTestimonials = async () => {
    const res = await fetch(`${API}/admin/testimonials`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load testimonials");
    setTestimonials(await res.json());
  };

  const loadReviews = async () => {
    const params = new URLSearchParams();
    if (reviewFilter.status) params.set("status", reviewFilter.status);
    if (reviewFilter.productId) params.set("productId", reviewFilter.productId);
    if (reviewFilter.rating) params.set("rating", reviewFilter.rating);
    const res = await fetch(`${API}/admin/reviews?${params.toString()}`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load reviews");
    setReviews(await res.json());
  };

  const loadCounter = async () => {
    const res = await fetch(`${API}/admin/customers-served`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load counter");
    const data = await res.json();
    setCounter(data);
  };

  const loadPaymentMethods = async () => {
    const res = await fetch(`${API}/admin/payment-methods`, { headers: authHeaders });
    if (!res.ok) throw new Error("Failed to load payment methods");
    setPaymentMethods(await res.json());
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadSettings(), loadTestimonials(), loadReviews(), loadCounter(), loadPaymentMethods()]);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load trust data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadReviews();
  }, [reviewFilter.status, reviewFilter.productId, reviewFilter.rating]);

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

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700",
      approved: "bg-green-100 text-green-700",
      rejected: "bg-red-100 text-red-700",
      hidden: "bg-gray-100 text-gray-600",
    };
    return <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{status}</span>;
  };

  // ── Contact tab ────────────────────────────────────────────────────────────
  const ContactTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Business Email</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Email Address</label>
            <Input
              type="email"
              value={settings?.businessEmail ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s!, businessEmail: e.target.value }))}
              placeholder="support@topratedseotools.com"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="email-public"
              type="checkbox"
              checked={settings?.businessEmailPublic ?? false}
              onChange={(e) => setSettings((s) => ({ ...s!, businessEmailPublic: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 accent-primary"
            />
            <label htmlFor="email-public" className="text-sm font-medium">Display publicly on website</label>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="email-clickable"
              type="checkbox"
              checked={settings?.businessEmailClickable ?? true}
              onChange={(e) => setSettings((s) => ({ ...s!, businessEmailClickable: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 accent-primary"
            />
            <label htmlFor="email-clickable" className="text-sm font-medium">Clicking opens the visitor&apos;s email app</label>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSettings({
                  businessEmail: settings?.businessEmail ?? null,
                  businessEmailPublic: settings?.businessEmailPublic ?? false,
                  businessEmailClickable: settings?.businessEmailClickable ?? true,
                })
              }
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> Save Contact Info
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  // ── Support Page tab ─────────────────────────────────────────────────────
  const SupportPageTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Support Page Message</h3>
        <p className="text-sm text-muted-foreground mb-4">
          This message is shown on the public <strong>/support</strong> page. It should encourage visitors to use WhatsApp for a quick response.
        </p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Message</label>
            <Textarea
              value={settings?.supportPageMessage ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s!, supportPageMessage: e.target.value }))}
              rows={4}
              placeholder="For the fastest response, please reach out to us on WhatsApp. We typically reply within minutes."
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() =>
                saveSettings({
                  supportPageMessage: settings?.supportPageMessage ?? null,
                })
              }
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> Save Support Message
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );

  // ── WhatsApp tab ───────────────────────────────────────────────────────────
  const WhatsAppTab = () => (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-4">WhatsApp Support Button</h3>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            id="wa-enabled"
            type="checkbox"
            checked={settings?.whatsappEnabled ?? false}
            onChange={(e) => setSettings((s) => ({ ...s!, whatsappEnabled: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 accent-primary"
          />
          <label htmlFor="wa-enabled" className="text-sm font-medium">Enable floating WhatsApp button</label>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">WhatsApp Number (international format)</label>
          <Input
            value={settings?.whatsappNumber ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s!, whatsappNumber: e.target.value }))}
            placeholder="+2348012345678"
          />
          <p className="text-xs text-muted-foreground mt-1">Include country code, e.g. +234 801 234 5678.</p>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Default Support Message</label>
          <Textarea
            value={settings?.whatsappMessage ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s!, whatsappMessage: e.target.value }))}
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() =>
              saveSettings({
                whatsappEnabled: settings?.whatsappEnabled ?? false,
                whatsappNumber: settings?.whatsappNumber ?? null,
                whatsappMessage: settings?.whatsappMessage ?? null,
              })
            }
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Save className="w-4 h-4 mr-2" /> Save WhatsApp Settings
          </Button>
        </div>
      </div>
    </Card>
  );

  // ── Testimonials tab ───────────────────────────────────────────────────────
  const TestimonialsTab = () => {
    const submitTestimonial = async () => {
      const body = {
        displayName: testimonialForm.displayName?.trim(),
        jobTitle: testimonialForm.jobTitle?.trim(),
        text: testimonialForm.text?.trim(),
        rating: testimonialForm.rating,
        published: testimonialForm.published,
        permissionObtained: testimonialForm.permissionObtained,
        isSample: false,
      };
      if (!body.displayName || !body.text) {
        toast({ title: "Missing fields", description: "Display name and testimonial text are required.", variant: "destructive" });
        return;
      }
      const url = editingTestimonial ? `${API}/admin/testimonials/${editingTestimonial.id}` : `${API}/admin/testimonials`;
      const res = await fetch(url, {
        method: editingTestimonial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
        return;
      }
      setTestimonialForm({ displayName: "", jobTitle: "", text: "", rating: 5, published: false, permissionObtained: false });
      setEditingTestimonial(null);
      await loadTestimonials();
      toast({ title: "Saved" });
    };

    const togglePublish = async (t: Testimonial) => {
      if (t.isSample && !t.permissionObtained) {
        toast({ title: "Cannot publish sample", description: "Sample testimonials must be edited and have permission obtained before publishing.", variant: "destructive" });
        return;
      }
      const res = await fetch(`${API}/admin/testimonials/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ published: !t.published }),
      });
      if (res.ok) await loadTestimonials();
    };

    const reorder = async (id: number, direction: "up" | "down") => {
      const idx = testimonials.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= testimonials.length) return;
      const reordered = [...testimonials];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      await fetch(`${API}/admin/testimonials/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids: reordered.map((t) => t.id) }),
      });
      await loadTestimonials();
    };

    const uploadAvatar = async (file: File, id: number) => {
      setUploadingAvatarFor(id);
      const form = new FormData();
      form.append("avatar", file);
      const res = await fetch(`${API}/admin/testimonials/${id}/avatar`, { method: "POST", headers: authHeaders, body: form });
      setUploadingAvatarFor(null);
      if (res.ok) {
        await loadTestimonials();
        toast({ title: "Avatar uploaded" });
      } else {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    };

    return (
      <div className="space-y-6">
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">Show Testimonials</h3>
              <p className="text-sm text-muted-foreground">Toggle the public testimonials section on or off.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="testimonials-enabled"
                type="checkbox"
                checked={settings?.testimonialsEnabled ?? true}
                onChange={(e) => setSettings((s) => ({ ...s!, testimonialsEnabled: e.target.checked }))}
                className="w-5 h-5 rounded accent-primary"
              />
              <label htmlFor="testimonials-enabled" className="text-sm font-medium">
                {settings?.testimonialsEnabled ?? true ? "On" : "Off"}
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveSettings({ testimonialsEnabled: settings?.testimonialsEnabled ?? true })}
              >
                Save Toggle
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">{editingTestimonial ? "Edit Testimonial" : "Add Testimonial"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              placeholder="Customer display name"
              value={testimonialForm.displayName ?? ""}
              onChange={(e) => setTestimonialForm((f) => ({ ...f, displayName: e.target.value }))}
            />
            <Input
              placeholder="Job title / business (optional)"
              value={testimonialForm.jobTitle ?? ""}
              onChange={(e) => setTestimonialForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </div>
          <Textarea
            placeholder="Testimonial text"
            value={testimonialForm.text ?? ""}
            onChange={(e) => setTestimonialForm((f) => ({ ...f, text: e.target.value }))}
            rows={3}
            className="mb-4"
          />
          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium">Rating</label>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTestimonialForm((f) => ({ ...f, rating: i + 1 }))}
                  className="p-0.5 focus:outline-none"
                >
                  <Star className={`w-5 h-5 ${i < (testimonialForm.rating ?? 5) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <input
                id="t-permission"
                type="checkbox"
                checked={testimonialForm.permissionObtained ?? false}
                onChange={(e) => setTestimonialForm((f) => ({ ...f, permissionObtained: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <label htmlFor="t-permission" className="text-sm font-medium">Permission to publish obtained</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="t-published"
                type="checkbox"
                checked={testimonialForm.published ?? false}
                onChange={(e) => setTestimonialForm((f) => ({ ...f, published: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <label htmlFor="t-published" className="text-sm font-medium">Published</label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submitTestimonial} className="bg-primary hover:bg-primary/90 text-white">
              <Save className="w-4 h-4 mr-2" /> {editingTestimonial ? "Update" : "Add"}
            </Button>
            {editingTestimonial && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingTestimonial(null);
                  setTestimonialForm({ displayName: "", jobTitle: "", text: "", rating: 5, published: false, permissionObtained: false });
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          {testimonials.map((t) => (
            <Card key={t.id} className={`p-5 ${t.isSample ? "border-amber-300 bg-amber-50/30" : ""}`}>
              <div className="flex items-start gap-4">
                {t.avatarUrl ? (
                  <img src={t.avatarUrl} alt={t.displayName} className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">{t.displayName[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-foreground">
                        {t.displayName}
                        {t.isSample && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Sample</span>}
                      </div>
                      {t.jobTitle && <div className="text-xs text-muted-foreground font-semibold">{t.jobTitle}</div>}
                      <div className="flex items-center gap-1 mt-1">
                        {t.rating && Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-3.5 h-3.5 ${i < t.rating! ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => reorder(t.id, "up")} className="p-1 text-muted-foreground hover:text-foreground" title="Move up"><GripVertical className="w-4 h-4 -rotate-90" /></button>
                      <button onClick={() => reorder(t.id, "down")} className="p-1 text-muted-foreground hover:text-foreground" title="Move down"><GripVertical className="w-4 h-4 rotate-90" /></button>
                      <button
                        onClick={() => {
                          setEditingTestimonial(t);
                          setTestimonialForm({ ...t });
                        }}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => togglePublish(t)}
                        className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                      >
                        {t.published ? <><EyeOff className="w-3.5 h-3.5" /> Unpublish</> : <><Eye className="w-3.5 h-3.5" /> Publish</>}
                      </button>
                      <button onClick={() => setDeleteTestimonialId(t.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground font-medium mt-3 leading-relaxed">{t.text}</p>
                  {!t.permissionObtained && !t.isSample && (
                    <p className="text-xs text-amber-700 font-semibold mt-2">Permission not obtained — obtain permission before publishing.</p>
                  )}
                  <div className="mt-3">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={testimonialAvatarRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadAvatar(file, t.id);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={uploadingAvatarFor === t.id}
                      onClick={() => testimonialAvatarRef.current?.click()}
                    >
                      {uploadingAvatarFor === t.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                      {t.avatarUrl ? "Replace avatar" : "Upload avatar"}
                    </Button>
                    {t.avatarUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-red-500 ml-2"
                        onClick={async () => {
                          await fetch(`${API}/admin/testimonials/${t.id}/avatar`, { method: "DELETE", headers: authHeaders });
                          await loadTestimonials();
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={!!deleteTestimonialId} onOpenChange={() => setDeleteTestimonialId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete testimonial?</DialogTitle>
              <DialogDescription>This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTestimonialId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!deleteTestimonialId) return;
                  await fetch(`${API}/admin/testimonials/${deleteTestimonialId}`, { method: "DELETE", headers: authHeaders });
                  setDeleteTestimonialId(null);
                  await loadTestimonials();
                  toast({ title: "Deleted" });
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ── Reviews tab ────────────────────────────────────────────────────────────
  const ReviewsTab = () => {
    const updateStatus = async (id: number, status: Review["status"]) => {
      const res = await fetch(`${API}/admin/reviews/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await loadReviews();
        toast({ title: "Status updated" });
      }
    };

    const submitReply = async () => {
      if (!replyReview || !replyText.trim()) return;
      const res = await fetch(`${API}/admin/reviews/${replyReview.id}/reply`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (res.ok) {
        setReplyReview(null);
        setReplyText("");
        await loadReviews();
        toast({ title: "Reply posted" });
      }
    };

    const deleteReview = async () => {
      if (!deleteReviewId) return;
      await fetch(`${API}/admin/reviews/${deleteReviewId}`, { method: "DELETE", headers: authHeaders });
      setDeleteReviewId(null);
      await loadReviews();
      toast({ title: "Review deleted" });
    };

    return (
      <div className="space-y-6">
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <select
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={reviewFilter.status}
              onChange={(e) => setReviewFilter((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="hidden">Hidden</option>
            </select>
            <Input
              placeholder="Product ID"
              className="w-32"
              value={reviewFilter.productId}
              onChange={(e) => setReviewFilter((f) => ({ ...f, productId: e.target.value }))}
            />
            <select
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={reviewFilter.rating}
              onChange={(e) => setReviewFilter((f) => ({ ...f, rating: e.target.value }))}
            >
              <option value="">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </select>
          </div>
        </Card>

        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-4 h-4 ${i < r.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />)}
                    </div>
                    {statusBadge(r.status)}
                    {r.verified && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-3 h-3" /> Verified Purchase
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground font-semibold">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                  {r.title && <h4 className="font-bold mb-1">{r.title}</h4>}
                  <p className="text-foreground font-medium leading-relaxed mb-3">{r.text}</p>
                  <div className="text-xs text-muted-foreground mb-3">
                    Product ID: {r.productId}{r.productName ? ` — ${r.productName}` : ""} | Order ID: {r.orderId} | Customer: {r.clerkUserId}
                  </div>
                  {r.adminReply && (
                    <div className="bg-[#F7F8F9] rounded-xl p-4 border border-border mb-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-1"><MessageSquareReply className="w-3.5 h-3.5" /> Admin reply</div>
                      <p className="text-sm font-medium">{r.adminReply}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      className="h-9 px-2 rounded-md border border-input bg-background text-sm"
                      value={r.status}
                      onChange={(e) => updateStatus(r.id, e.target.value as Review["status"])}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="hidden">Hidden</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={() => { setReplyReview(r); setReplyText(r.adminReply ?? ""); }}>Reply</Button>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteReviewId(r.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {reviews.length === 0 && <p className="text-center text-muted-foreground py-12">No reviews match the selected filters.</p>}
        </div>

        <Dialog open={!!replyReview} onOpenChange={() => setReplyReview(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reply to review</DialogTitle>
            </DialogHeader>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={4}
              placeholder="Write a public response..."
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setReplyReview(null)}>Cancel</Button>
              <Button onClick={submitReply} className="bg-primary hover:bg-primary/90 text-white">Post Reply</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteReviewId} onOpenChange={() => setDeleteReviewId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete review?</DialogTitle>
              <DialogDescription>This removes the review permanently.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteReviewId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteReview}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ── Counter tab ────────────────────────────────────────────────────────────
  const CounterTab = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Customers Served Counter</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#F7F8F9] rounded-xl p-4 border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Baseline</div>
            <div className="text-2xl font-heading font-bold text-foreground">{counter?.baseline ?? 0}</div>
          </div>
          <div className="bg-[#F7F8F9] rounded-xl p-4 border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live qualifying count</div>
            <div className="text-2xl font-heading font-bold text-foreground">{counter?.liveCount ?? 0}</div>
          </div>
          <div className="bg-[#F7F8F9] rounded-xl p-4 border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Displayed total</div>
            <div className="text-2xl font-heading font-bold text-primary">{counter?.displayedTotal ?? 0}</div>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Starting baseline</label>
            <Input
              type="number"
              min={0}
              value={counterForm.baseline}
              onChange={(e) => setCounterForm((f) => ({ ...f, baseline: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Manual correction</label>
            <Input
              type="number"
              value={counterForm.manualCorrection}
              onChange={(e) => setCounterForm((f) => ({ ...f, manualCorrection: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Counting method</label>
            <select
              className="h-10 px-3 rounded-md border border-input bg-background text-sm w-full"
              value={counterForm.countingMethod}
              onChange={(e) => setCounterForm((f) => ({ ...f, countingMethod: e.target.value }))}
            >
              <option value="unique_customers">Unique Customers Served</option>
              <option value="orders">Successful Orders Completed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">Reason for change</label>
            <Input
              value={counterForm.reason}
              onChange={(e) => setCounterForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Corrected baseline after launch"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={async () => {
                const res = await fetch(`${API}/admin/customers-served`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", ...authHeaders },
                  body: JSON.stringify(counterForm),
                });
                if (res.ok) {
                  await loadCounter();
                  await loadSettings();
                  toast({ title: "Counter updated" });
                } else {
                  const data = await res.json().catch(() => ({}));
                  toast({ title: "Error", description: data.error || "Failed to update", variant: "destructive" });
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Save className="w-4 h-4 mr-2" /> Update Counter
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Audit History</h3>
        {counter?.audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No manual corrections recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">Previous</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">New</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">Reason</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-muted-foreground">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {counter?.audits.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{a.previousTotal}</td>
                    <td className="px-3 py-2 font-bold">{a.newTotal}</td>
                    <td className="px-3 py-2">{a.reason}</td>
                    <td className="px-3 py-2">{a.correctedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );

  // ── Payment Methods tab ──────────────────────────────────────────────────
  const PaymentsTab = () => {
    const submitPayment = async () => {
      const body = {
        name: paymentForm.name?.trim(),
        code: paymentForm.code?.trim().toLowerCase(),
        altText: paymentForm.altText?.trim(),
        iconUrl: paymentForm.iconUrl?.trim() || null,
        enabled: paymentForm.enabled,
        provider: paymentForm.provider?.trim() || "paystack",
      };
      if (!body.name || !body.code) {
        toast({ title: "Missing fields", description: "Name and code are required.", variant: "destructive" });
        return;
      }
      const url = editingPayment ? `${API}/admin/payment-methods/${editingPayment.id}` : `${API}/admin/payment-methods`;
      const res = await fetch(url, {
        method: editingPayment ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
        return;
      }
      setPaymentForm({ name: "", code: "", altText: "", iconUrl: "", enabled: true, provider: "paystack" });
      setEditingPayment(null);
      await loadPaymentMethods();
      toast({ title: "Saved" });
    };

    const reorder = async (id: number, direction: "up" | "down") => {
      const idx = paymentMethods.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= paymentMethods.length) return;
      const reordered = [...paymentMethods];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      await fetch(`${API}/admin/payment-methods/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids: reordered.map((p) => p.id) }),
      });
      await loadPaymentMethods();
    };

    const uploadIcon = async (file: File, id: number) => {
      setUploadingIconFor(id);
      const form = new FormData();
      form.append("icon", file);
      const res = await fetch(`${API}/admin/payment-methods/${id}/icon`, { method: "POST", headers: authHeaders, body: form });
      setUploadingIconFor(null);
      if (res.ok) {
        await loadPaymentMethods();
        toast({ title: "Icon uploaded" });
      } else {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    };

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Payment Method Icons</h3>
            <div className="flex items-center gap-2">
              <input
                id="pi-enabled"
                type="checkbox"
                checked={settings?.paymentIconsEnabled ?? true}
                onChange={(e) => setSettings((s) => ({ ...s!, paymentIconsEnabled: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <label htmlFor="pi-enabled" className="text-sm font-medium">Show icons on site</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveSettings({ paymentIconsEnabled: settings?.paymentIconsEnabled ?? true })}
              >
                Save toggle
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input placeholder="Name e.g. Visa" value={paymentForm.name ?? ""} onChange={(e) => setPaymentForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Code e.g. visa" value={paymentForm.code ?? ""} onChange={(e) => setPaymentForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input placeholder="Alt text" value={paymentForm.altText ?? ""} onChange={(e) => setPaymentForm((f) => ({ ...f, altText: e.target.value }))} />
            <Input placeholder="Icon URL (external image link)" value={paymentForm.iconUrl ?? ""} onChange={(e) => setPaymentForm((f) => ({ ...f, iconUrl: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <input
              id="pm-enabled"
              type="checkbox"
              checked={paymentForm.enabled ?? true}
              onChange={(e) => setPaymentForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="w-4 h-4 rounded accent-primary"
            />
            <label htmlFor="pm-enabled" className="text-sm font-medium">Enabled</label>
          </div>
          <div className="flex gap-2">
            <Button onClick={submitPayment} className="bg-primary hover:bg-primary/90 text-white">
              <Plus className="w-4 h-4 mr-2" /> {editingPayment ? "Update" : "Add"}
            </Button>
            {editingPayment && (
              <Button variant="outline" onClick={() => { setEditingPayment(null); setPaymentForm({ name: "", code: "", altText: "", iconUrl: "", enabled: true, provider: "paystack" }); }}>
                Cancel
              </Button>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          {paymentMethods.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white border border-gray-100 rounded-lg flex items-center justify-center p-2">
                  {p.iconUrl ? <img src={p.iconUrl} alt={p.altText || p.name} className="max-w-full max-h-full object-contain" /> : <span className="text-xs font-bold text-muted-foreground">{p.name}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground flex items-center gap-2">
                    {p.name}
                    <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.code}</span>
                    {!p.enabled && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Disabled</span>}
                    {p.isAutoDetected && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Auto</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.altText || p.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => reorder(p.id, "up")} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 -rotate-90" /></button>
                  <button onClick={() => reorder(p.id, "down")} className="p-1 text-muted-foreground hover:text-foreground"><GripVertical className="w-4 h-4 rotate-90" /></button>
                  <Button variant="outline" size="sm" onClick={() => { setEditingPayment(p); setPaymentForm({ ...p }); }}>Edit</Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={paymentIconRef}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadIcon(file, p.id); e.target.value = ""; }}
                  />
                  <Button variant="outline" size="sm" disabled={uploadingIconFor === p.id} onClick={() => paymentIconRef.current?.click()}>
                    {uploadingIconFor === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeletePaymentId(p.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={!!deletePaymentId} onOpenChange={() => setDeletePaymentId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete payment method?</DialogTitle>
              <DialogDescription>This removes the icon from the public display.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletePaymentId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={async () => { if (!deletePaymentId) return; await fetch(`${API}/admin/payment-methods/${deletePaymentId}`, { method: "DELETE", headers: authHeaders }); setDeletePaymentId(null); await loadPaymentMethods(); toast({ title: "Deleted" }); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
          Trust, Reviews <span className="text-primary">&amp; Support</span>
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage contact details, testimonials, verified reviews, customer counter, and accepted payment icons.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList className="mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="contact">Contact Information</TabsTrigger>
          <TabsTrigger value="support">Support Page</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp Support</TabsTrigger>
          <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
          <TabsTrigger value="reviews">Purchase Reviews</TabsTrigger>
          <TabsTrigger value="counter">Customer Counter</TabsTrigger>
          <TabsTrigger value="payments">Payment Methods</TabsTrigger>
        </TabsList>

        <TabsContent value="contact"><ContactTab /></TabsContent>
        <TabsContent value="support"><SupportPageTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="testimonials"><TestimonialsTab /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
        <TabsContent value="counter"><CounterTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
