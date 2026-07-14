import { useEffect, useState } from "react";
import { Loader2, Plus, Tag, Trash2, Pencil, X, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  scope: "all" | "selected";
  productIds: number[];
  minPurchaseKobo: number;
  maxDiscountKobo: number | null;
  usageLimitTotal: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  requiresLogin: boolean;
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface Redemption {
  id: number;
  orderId: number;
  customerEmail: string;
  discountKobo: number;
  createdAt: string;
}

interface FormState {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minPurchaseKobo: string;
  maxDiscountKobo: string;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  requiresLogin: boolean;
  active: boolean;
  startsAt: string;
  expiresAt: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minPurchaseKobo: "",
  maxDiscountKobo: "",
  usageLimitTotal: "",
  usageLimitPerCustomer: "",
  requiresLogin: false,
  active: true,
  startsAt: "",
  expiresAt: "",
};

async function fetchCoupons(token: string): Promise<Coupon[]> {
  const res = await fetch(`${API}/admin/coupons`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchRedemptions(token: string, couponId: number): Promise<Redemption[]> {
  const res = await fetch(`${API}/admin/coupons/${couponId}/redemptions`, { headers: { Authorization: token } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function CouponsAdminPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [redemptionsFor, setRedemptionsFor] = useState<Coupon | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setCoupons(await fetchCoupons(token));
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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c: Coupon) => {
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      // Fixed discounts are stored in kobo; show naira in the form. Percentage
      // values are unitless (0-100) and pass through as-is.
      discountValue: c.discountType === "fixed" ? String(c.discountValue / 100) : String(c.discountValue),
      minPurchaseKobo: c.minPurchaseKobo ? String(c.minPurchaseKobo / 100) : "",
      maxDiscountKobo: c.maxDiscountKobo ? String(c.maxDiscountKobo / 100) : "",
      usageLimitTotal: c.usageLimitTotal != null ? String(c.usageLimitTotal) : "",
      usageLimitPerCustomer: c.usageLimitPerCustomer != null ? String(c.usageLimitPerCustomer) : "",
      requiresLogin: c.requiresLogin,
      active: c.active,
      startsAt: c.startsAt ? c.startsAt.slice(0, 10) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.discountValue.trim()) {
      toast({ title: "Code and discount value are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        code: form.code.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        // Fixed discounts are entered in naira in the form but stored in kobo;
        // percentage values are unitless (0-100) and pass through as-is.
        discountValue:
          form.discountType === "fixed"
            ? Math.round(Number(form.discountValue) * 100)
            : Math.round(Number(form.discountValue)),
        scope: "all",
        minPurchaseKobo: form.minPurchaseKobo ? Math.round(Number(form.minPurchaseKobo) * 100) : 0,
        maxDiscountKobo: form.maxDiscountKobo ? Math.round(Number(form.maxDiscountKobo) * 100) : null,
        usageLimitTotal: form.usageLimitTotal ? parseInt(form.usageLimitTotal, 10) : null,
        usageLimitPerCustomer: form.usageLimitPerCustomer ? parseInt(form.usageLimitPerCustomer, 10) : null,
        requiresLogin: form.requiresLogin,
        active: form.active,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
      };
      const res = await fetch(editingId ? `${API}/admin/coupons/${editingId}` : `${API}/admin/coupons`, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to save coupon");
      toast({ title: editingId ? "Coupon updated" : "Coupon created" });
      setShowForm(false);
      await load();
    } catch (e) {
      toast({ title: "Could not save coupon", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Coupon) => {
    if (!window.confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/admin/coupons/${c.id}`, { method: "DELETE", headers: { Authorization: token } });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Coupon deleted" });
      await load();
    } catch (e) {
      toast({ title: "Could not delete coupon", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      const res = await fetch(`${API}/admin/coupons/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ active: !c.active }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      toast({ title: "Could not update coupon", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const viewRedemptions = async (c: Coupon) => {
    setRedemptionsFor(c);
    setRedemptionsLoading(true);
    try {
      setRedemptions(await fetchRedemptions(token, c.id));
    } catch {
      setRedemptions([]);
    } finally {
      setRedemptionsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold uppercase flex items-center gap-2">
            <Tag className="w-6 h-6 text-primary" /> Coupons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage discount codes for checkout.</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
          <Plus className="w-4 h-4" /> New Coupon
        </Button>
      </div>

      {error && <p className="text-sm text-red-500 font-medium mb-4">{error}</p>}

      {coupons.length === 0 ? (
        <p className="text-muted-foreground text-center py-16">No coupons yet. Create your first one above.</p>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-foreground">{c.code}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {c.discountType === "percentage" ? `${c.discountValue}% off` : `₦${(c.discountValue / 100).toLocaleString()} off`}
                  {c.usageLimitTotal != null && ` · ${c.usedCount}/${c.usageLimitTotal} used`}
                  {c.usageLimitTotal == null && c.usedCount > 0 && ` · ${c.usedCount} used`}
                  {c.description ? ` · ${c.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} />
                <Button variant="ghost" size="icon" onClick={() => viewRedemptions(c)} title="Redemption history">
                  <History className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edit">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(c)} title="Delete">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold uppercase">{editingId ? "Edit Coupon" : "New Coupon"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Code</label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SAVE20" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Description (internal)</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Discount Type</label>
                  <select
                    className="w-full h-10 border border-input rounded-md px-3 text-sm"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })}
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed (₦)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">
                    {form.discountType === "percentage" ? "Percent Off" : "Amount Off (₦)"}
                  </label>
                  <Input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Min Purchase (₦)</label>
                  <Input type="number" value={form.minPurchaseKobo} onChange={(e) => setForm({ ...form, minPurchaseKobo: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Max Discount Cap (₦)</label>
                  <Input type="number" value={form.maxDiscountKobo} onChange={(e) => setForm({ ...form, maxDiscountKobo: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Total Usage Limit</label>
                  <Input type="number" value={form.usageLimitTotal} onChange={(e) => setForm({ ...form, usageLimitTotal: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Per-Customer Limit</label>
                  <Input type="number" value={form.usageLimitPerCustomer} onChange={(e) => setForm({ ...form, usageLimitPerCustomer: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Starts</label>
                  <Input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground">Expires</label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.requiresLogin} onCheckedChange={(v) => setForm({ ...form, requiresLogin: v })} />
                <span className="text-sm font-semibold">Require customer to be logged in</span>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <span className="text-sm font-semibold">Active</span>
              </div>
              <Button onClick={save} disabled={saving} className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Save Changes" : "Create Coupon"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {redemptionsFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRedemptionsFor(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold uppercase">{redemptionsFor.code} — Redemptions</h2>
              <button onClick={() => setRedemptionsFor(null)}><X className="w-5 h-5" /></button>
            </div>
            {redemptionsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            ) : redemptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No redemptions yet.</p>
            ) : (
              <div className="space-y-2">
                {redemptions.map((r) => (
                  <div key={r.id} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                    <span>{r.customerEmail}</span>
                    <span className="font-bold text-primary">-₦{(r.discountKobo / 100).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
