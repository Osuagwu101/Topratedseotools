import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Eye,
  EyeOff,
  Save,
  ShieldCheck,
  Lock,
  Monitor,
  Trash2,
  User,
  Plus,
  Search,
  UserPlus,
  Gift,
  ImageIcon,
  Upload,
  X,
  PencilLine,
} from "lucide-react";

interface ToolServer {
  id?: number;
  productId: number;
  label: string;
  username?: string | null;
  password?: string | null;
  loginUrl?: string | null;
  usernameField?: string | null;
  passwordField?: string | null;
  isAutoLogin?: boolean | null;
  notes?: string | null;
}

interface ProductWithServers {
  id: number;
  name: string;
  description?: string;
  fullDescription?: string | null;
  category?: string;
  billingPeriod: string;
  imageUrl?: string | null;
  priceKobo: number;
  price3MonthKobo: number | null;
  price12MonthKobo: number | null;
  isHidden?: boolean;
  oneClickAuthEnabled?: boolean;
  maxDailyInputs?: number | null;
  servers: ToolServer[];
}

const STANDARD_IMAGE_SIZE = 512;

interface ImageAnalysis {
  width: number;
  height: number;
  matchesStandard: boolean;
  standardSize: number;
}

interface DeviceEntry {
  deviceId: string;
  userAgent: string | null;
  browser: string;
  os: string;
  deviceType: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface UserDeviceSession {
  userId: string;
  email: string | null;
  deviceCount: number;
  devices: DeviceEntry[];
  suspended: boolean;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMonth = Math.round(diffDay / 30);
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
}

interface ClerkUserResult {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
}

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

function makeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function koboToNaira(kobo: number | null): string {
  if (kobo === null || kobo === undefined) return "";
  return String(kobo / 100);
}

function nairaToKobo(naira: string): number {
  return Math.round(parseFloat(naira || "0") * 100);
}

async function fetchProducts(token: string): Promise<ProductWithServers[]> {
  const res = await fetch(`${API}/admin/products`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveServer(token: string, body: ToolServer): Promise<void> {
  const url = body.id ? `${API}/admin/servers/${body.id}` : `${API}/admin/servers`;
  const res = await fetch(url, {
    method: body.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function deleteServer(token: string, id: number): Promise<void> {
  const res = await fetch(`${API}/admin/servers/${id}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
}

async function savePricing(
  token: string,
  productId: number,
  body: { priceKobo?: number; price3MonthKobo?: number | null; price12MonthKobo?: number | null },
): Promise<void> {
  const res = await fetch(`${API}/admin/products/${productId}/pricing`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function analyzeToolImage(
  token: string,
  productId: number,
  file: File,
): Promise<ImageAnalysis> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API}/admin/products/${productId}/image/analyze`, {
    method: "POST",
    headers: { Authorization: token },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function uploadToolImage(
  token: string,
  productId: number,
  file: File,
): Promise<ProductWithServers> {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`${API}/admin/products/${productId}/image`, {
    method: "POST",
    headers: { Authorization: token },
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function removeToolImage(token: string, productId: number): Promise<void> {
  const res = await fetch(`${API}/admin/products/${productId}/image`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
}

interface NewToolInput {
  name: string;
  description: string;
  fullDescription?: string;
  category: string;
  billingPeriod: string;
  priceKobo: number;
  price3MonthKobo?: number | null;
  price12MonthKobo?: number | null;
  isHidden: boolean;
}

async function createProduct(token: string, body: NewToolInput): Promise<ProductWithServers> {
  const res = await fetch(`${API}/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function updateProductDetails(
  token: string,
  productId: number,
  body: { name?: string; description?: string; fullDescription?: string | null; category?: string; billingPeriod?: string },
): Promise<ProductWithServers> {
  const res = await fetch(`${API}/admin/products/${productId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function setProductVisibility(token: string, productId: number, isHidden: boolean): Promise<void> {
  const res = await fetch(`${API}/admin/products/${productId}/visibility`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ isHidden }),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function activateOneClickAuth(
  token: string,
  productId: number,
  maxDailyInputs: number | null,
): Promise<ProductWithServers> {
  const res = await fetch(`${API}/admin/products/${productId}/one-click-auth/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ maxDailyInputs }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deactivateOneClickAuth(token: string, productId: number): Promise<ProductWithServers> {
  const res = await fetch(`${API}/admin/products/${productId}/one-click-auth`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ enabled: false }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function deleteProduct(token: string, productId: number): Promise<void> {
  const res = await fetch(`${API}/admin/products/${productId}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
}

async function fetchDeviceSessions(token: string): Promise<UserDeviceSession[]> {
  const res = await fetch(`${API}/admin/device-sessions`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function clearDeviceSessions(token: string, userId: string): Promise<void> {
  const res = await fetch(`${API}/admin/device-sessions/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
}

async function searchUsers(token: string, query: string): Promise<ClerkUserResult[]> {
  const res = await fetch(`${API}/admin/users/search?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createUser(
  token: string,
  body: { emailAddress: string; password: string; firstName?: string; lastName?: string },
): Promise<ClerkUserResult> {
  const res = await fetch(`${API}/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function grantEntitlement(
  token: string,
  body: { clerkUserId: string; productId: number; durationMonths: number; serverId?: number | null },
): Promise<void> {
  const res = await fetch(`${API}/admin/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

function ServerCard({
  productId,
  server,
  token,
  onSaved,
  onDeleted,
}: {
  productId: number;
  server: ToolServer;
  token: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ToolServer>(server);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k: keyof ToolServer, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveServer(token, { ...form, productId });
      toast({ title: "Saved", description: `${form.label} credentials updated.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.id) return;
    setDeleting(true);
    try {
      await deleteServer(token, form.id);
      toast({ title: "Removed", description: `${form.label} deleted.` });
      onDeleted();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <Input
          value={form.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="Server label (e.g. Server 1)"
          className="font-bold max-w-xs"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary"
              checked={!!form.isAutoLogin}
              onChange={(e) => set("isAutoLogin", e.target.checked)}
            />
            <span className="text-primary">Auto-Login</span>
          </label>
          {form.id && (
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50 h-8 px-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Username / Email
          </label>
          <Input
            value={form.username ?? ""}
            onChange={(e) => set("username", e.target.value)}
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Password
          </label>
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              value={form.password ?? ""}
              onChange={(e) => set("password", e.target.value)}
              placeholder="••••••••"
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowPass((v) => !v)}
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {form.isAutoLogin && (
          <>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Login URL (POST target)
              </label>
              <Input
                value={form.loginUrl ?? ""}
                onChange={(e) => set("loginUrl", e.target.value)}
                placeholder="https://app.phrasly.ai/login"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Username form field name
              </label>
              <Input
                value={form.usernameField ?? "email"}
                onChange={(e) => set("usernameField", e.target.value)}
                placeholder="email"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Password form field name
              </label>
              <Input
                value={form.passwordField ?? "password"}
                onChange={(e) => set("passwordField", e.target.value)}
                placeholder="password"
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Admin Notes
          </label>
          <Input
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="e.g. Shared account — max 5 concurrent sessions"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          size="sm"
          className="bg-primary hover:bg-primary/90 text-white font-bold gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PricingRow({
  product,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [price1, setPrice1] = useState(koboToNaira(product.priceKobo));
  const [price3, setPrice3] = useState(koboToNaira(product.price3MonthKobo));
  const [price12, setPrice12] = useState(koboToNaira(product.price12MonthKobo));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await savePricing(token, product.id, {
        priceKobo: nairaToKobo(price1),
        price3MonthKobo: price3.trim() ? nairaToKobo(price3) : null,
        price12MonthKobo: price12.trim() ? nairaToKobo(price12) : null,
      });
      toast({ title: "Pricing saved", description: `${product.name} pricing updated.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isPerCheck = product.billingPeriod === "per_check";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
          {isPerCheck ? "Per-check (₦)" : "1 Month (₦)"}
        </label>
        <Input value={price1} onChange={(e) => setPrice1(e.target.value)} placeholder="2500" />
      </div>
      {!isPerCheck && (
        <>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              3 Months (₦)
            </label>
            <Input value={price3} onChange={(e) => setPrice3(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              12 Months (₦)
            </label>
            <Input value={price12} onChange={(e) => setPrice12(e.target.value)} placeholder="optional" />
          </div>
        </>
      )}
      <Button onClick={save} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving…" : "Save Pricing"}
      </Button>
    </div>
  );
}

function ImageManager({
  product,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingAnalysis, setPendingAnalysis] = useState<ImageAnalysis | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
    setPendingAnalysis(null);
  };

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPendingFile(file);
    try {
      const analysis = await analyzeToolImage(token, product.id, file);
      if (analysis.matchesStandard) {
        await commitUpload(file);
      } else {
        setPendingAnalysis(analysis);
      }
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
      reset();
    }
  };

  const commitUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadToolImage(token, product.id, file);
      toast({ title: "Image saved", description: `${product.name} logo updated.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
      reset();
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await removeToolImage(token, product.id);
      toast({ title: "Image removed", description: `${product.name} logo cleared.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 block">
        Tool Image
      </label>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview || product.imageUrl ? (
            <img
              src={preview ?? product.imageUrl ?? ""}
              alt={`${product.name} logo`}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <ImageIcon className="w-6 h-6 text-gray-300" />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-primary cursor-pointer hover:underline">
            <Upload className="w-4 h-4" />
            {product.imageUrl ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void onFileSelected(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {product.imageUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className="inline-flex items-center gap-2 text-sm font-semibold text-red-500 hover:underline"
            >
              <Trash2 className="w-4 h-4" />
              {removing ? "Removing…" : "Remove image"}
            </button>
          )}
        </div>
      </div>

      {pendingAnalysis && pendingFile && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-yellow-800">
            This image is {pendingAnalysis.width}×{pendingAnalysis.height}px, which doesn't match
            the site's standard {STANDARD_IMAGE_SIZE}×{STANDARD_IMAGE_SIZE} square used across the
            storefront.
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            We can automatically resize it (preserving its aspect ratio and optimizing it for fast
            loading) so it displays consistently everywhere.
          </p>
          <div className="flex gap-3 mt-3">
            <Button
              size="sm"
              disabled={uploading}
              className="bg-primary hover:bg-primary/90 text-white font-bold"
              onClick={() => commitUpload(pendingFile)}
            >
              {uploading ? "Resizing…" : "Auto-resize & save (recommended)"}
            </Button>
            <Button size="sm" variant="outline" disabled={uploading} onClick={reset} className="gap-1.5">
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsEditor({
  product,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [fullDescription, setFullDescription] = useState(product.fullDescription ?? "");
  const [category, setCategory] = useState(product.category ?? "");
  const [billingPeriod, setBillingPeriod] = useState(product.billingPeriod);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(product.name);
    setDescription(product.description ?? "");
    setFullDescription(product.fullDescription ?? "");
    setCategory(product.category ?? "");
    setBillingPeriod(product.billingPeriod);
  }, [product]);

  const save = async () => {
    setSaving(true);
    try {
      await updateProductDetails(token, product.id, {
        name: name.trim(),
        description: description.trim(),
        fullDescription: fullDescription.trim() ? fullDescription.trim() : null,
        category: category.trim(),
        billingPeriod,
      });
      toast({ title: "Details saved", description: `${name} updated.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Name
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tool name" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Category
          </label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Writing" />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
          Short Description
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Shown on the storefront card"
        />
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
          Full Description <span className="normal-case text-gray-400">(optional, shown on product page)</span>
        </label>
        <Textarea
          value={fullDescription}
          onChange={(e) => setFullDescription(e.target.value)}
          placeholder="Longer, detailed description"
          rows={3}
        />
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
          Billing Period
        </label>
        <select
          value={billingPeriod}
          onChange={(e) => setBillingPeriod(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="monthly">Monthly</option>
          <option value="per_check">Per-check</option>
        </select>
      </div>

      <Button onClick={save} disabled={saving || !name.trim()} size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Saving…" : "Save Details"}
      </Button>
    </div>
  );
}

function ToolConfigCard({
  product,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [servers, setServers] = useState<ToolServer[]>(product.servers);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [oneClickAuthModalOpen, setOneClickAuthModalOpen] = useState(false);
  const [activatingOneClickAuth, setActivatingOneClickAuth] = useState(false);
  const [deactivatingOneClickAuth, setDeactivatingOneClickAuth] = useState(false);
  const [maxDailyInputsInput, setMaxDailyInputsInput] = useState("");
  const [maxDailyInputsError, setMaxDailyInputsError] = useState<string | null>(null);

  useEffect(() => setServers(product.servers), [product.servers]);

  const addServer = () => {
    setServers((s) => [
      ...s,
      { productId: product.id, label: `Server ${s.length + 1}`, isAutoLogin: false },
    ]);
  };

  const toggleVisibility = async () => {
    setTogglingVisibility(true);
    try {
      await setProductVisibility(token, product.id, !product.isHidden);
      toast({
        title: product.isHidden ? "Tool unhidden" : "Tool hidden",
        description: `${product.name} is now ${product.isHidden ? "visible" : "hidden"} on the storefront.`,
      });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setTogglingVisibility(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteProduct(token, product.id);
      toast({ title: "Tool deleted", description: `${product.name} was permanently removed.` });
      setConfirmDeleteOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleOneClickAuthToggle = (checked: boolean) => {
    if (checked) {
      setMaxDailyInputsInput(
        product.maxDailyInputs != null ? String(product.maxDailyInputs) : "",
      );
      setMaxDailyInputsError(null);
      setOneClickAuthModalOpen(true);
    } else {
      void handleDeactivateOneClickAuth();
    }
  };

  const handleDeactivateOneClickAuth = async () => {
    setDeactivatingOneClickAuth(true);
    try {
      await deactivateOneClickAuth(token, product.id);
      toast({
        title: "One-Click Auth disabled",
        description: `${product.name}'s master session was cleared. Subscribers will no longer see the one-click login button.`,
      });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setDeactivatingOneClickAuth(false);
    }
  };

  const handleActivateOneClickAuth = async () => {
    const trimmed = maxDailyInputsInput.trim();
    let maxDailyInputs: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || !/^\d+$/.test(trimmed)) {
        setMaxDailyInputsError("Enter a whole positive number, or leave empty for unlimited.");
        return;
      }
      maxDailyInputs = n === 0 ? null : n;
    }
    setMaxDailyInputsError(null);
    setActivatingOneClickAuth(true);
    try {
      await activateOneClickAuth(token, product.id, maxDailyInputs);
      toast({
        title: "One-Click Auth enabled",
        description: `Signed in to ${product.name} with the configured credentials. All subscriber traffic will now be masked behind this session.`,
      });
      setOneClickAuthModalOpen(false);
      setMaxDailyInputsInput("");
      onSaved();
    } catch (e) {
      toast({ title: "Could not re-authenticate", description: String(e), variant: "destructive" });
    } finally {
      setActivatingOneClickAuth(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5 gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-bold text-lg text-foreground">{product.name}</h3>
          {product.isHidden && (
            <span className="text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              Hidden
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleVisibility}
            disabled={togglingVisibility}
            className="text-xs font-semibold gap-1.5"
          >
            {product.isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {togglingVisibility ? "Saving…" : product.isHidden ? "Unhide" : "Hide"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-xs font-semibold gap-1.5 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <div className="mb-6 pb-6 border-b border-gray-100">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
          <PencilLine className="w-3.5 h-3.5" />
          Details
        </label>
        <DetailsEditor product={product} token={token} onSaved={onSaved} />
      </div>

      <div className="mb-6 pb-6 border-b border-gray-100">
        <ImageManager product={product} token={token} onSaved={onSaved} />
      </div>

      <div className="mb-6 pb-6 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Enable Global One-Click Auth
            </label>
            <p className="text-xs text-muted-foreground max-w-md">
              When on, subscribers get a one-click login for {product.name} routed through our
              masking proxy — all traffic appears to come from one server IP/device using an
              admin-captured master session.
            </p>
          </div>
          <Switch
            checked={!!product.oneClickAuthEnabled}
            disabled={activatingOneClickAuth || deactivatingOneClickAuth}
            onCheckedChange={handleOneClickAuthToggle}
          />
        </div>
      </div>

      <div className="mb-6 pb-6 border-b border-gray-100">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 block">
          Pricing
        </label>
        <PricingRow product={product} token={token} onSaved={onSaved} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">
          Server Credentials ({servers.length})
        </label>
        <Button variant="outline" size="sm" onClick={addServer} className="text-xs font-semibold gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Server
        </Button>
      </div>

      <div className="space-y-3">
        {servers.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No servers configured yet.</p>
        )}
        {servers.map((s, i) => (
          <ServerCard
            key={s.id ?? `new-${i}`}
            productId={product.id}
            server={s}
            token={token}
            onSaved={onSaved}
            onDeleted={onSaved}
          />
        ))}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tool from the admin panel and storefront. Past orders and entitlements
              referencing it are preserved for historical records, but the tool can no longer be
              purchased, edited, or restored from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
            >
              {deleting ? "Deleting…" : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={oneClickAuthModalOpen} onOpenChange={(open) => !activatingOneClickAuth && setOneClickAuthModalOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-authenticate to enable One-Click Auth</DialogTitle>
            <DialogDescription>
              This signs in to {product.name} using the tool's configured Auto-Login server
              credentials to capture a fresh master session. Any previously cached session is
              discarded first. Once enabled, all subscriber traffic for this tool is routed
              through that single session, so it appears as one IP/device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Specify maximum inputs/tasks a user can perform per day (Leave empty or 0 for unlimited)
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="Unlimited"
              value={maxDailyInputsInput}
              onChange={(e) => {
                setMaxDailyInputsInput(e.target.value);
                setMaxDailyInputsError(null);
              }}
              disabled={activatingOneClickAuth}
            />
            {maxDailyInputsError && (
              <p className="text-xs text-red-500">{maxDailyInputsError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOneClickAuthModalOpen(false)}
              disabled={activatingOneClickAuth}
            >
              Cancel
            </Button>
            <Button onClick={handleActivateOneClickAuth} disabled={activatingOneClickAuth}>
              {activatingOneClickAuth ? "Signing in…" : "Re-authenticate & Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddToolDialog({
  open,
  onOpenChange,
  token,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const emptyForm = {
    name: "",
    description: "",
    fullDescription: "",
    category: "",
    billingPeriod: "monthly",
    price1: "",
    price3: "",
    price12: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isPerCheck = form.billingPeriod === "per_check";
  const canCreate = form.name.trim() && form.description.trim() && form.category.trim() && form.price1.trim();

  const create = async () => {
    setCreating(true);
    try {
      await createProduct(token, {
        name: form.name.trim(),
        description: form.description.trim(),
        fullDescription: form.fullDescription.trim() || undefined,
        category: form.category.trim(),
        billingPeriod: form.billingPeriod,
        priceKobo: nairaToKobo(form.price1),
        price3MonthKobo: !isPerCheck && form.price3.trim() ? nairaToKobo(form.price3) : null,
        price12MonthKobo: !isPerCheck && form.price12.trim() ? nairaToKobo(form.price12) : null,
        isHidden: false,
      });
      toast({ title: "Tool created", description: `${form.name} was added. Upload an image and add servers below.` });
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Tool</DialogTitle>
          <DialogDescription>
            Create the tool with its name, description, and pricing. You can upload an image and add
            server credentials afterward from its card in the list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Name
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Grammarly"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Category
              </label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Writing"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Short Description
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Shown on the storefront card"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Full Description <span className="normal-case text-gray-400">(optional)</span>
            </label>
            <Textarea
              value={form.fullDescription}
              onChange={(e) => setForm((f) => ({ ...f, fullDescription: e.target.value }))}
              placeholder="Longer, detailed description"
              rows={3}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Billing Period
            </label>
            <select
              value={form.billingPeriod}
              onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="per_check">Per-check</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                {isPerCheck ? "Per-check (₦)" : "1 Month (₦)"}
              </label>
              <Input
                value={form.price1}
                onChange={(e) => setForm((f) => ({ ...f, price1: e.target.value }))}
                placeholder="2500"
              />
            </div>
            {!isPerCheck && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                    3 Months (₦)
                  </label>
                  <Input
                    value={form.price3}
                    onChange={(e) => setForm((f) => ({ ...f, price3: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                    12 Months (₦)
                  </label>
                  <Input
                    value={form.price12}
                    onChange={(e) => setForm((f) => ({ ...f, price12: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={!canCreate || creating}
            className="bg-primary hover:bg-primary/90 text-white font-bold"
          >
            {creating ? "Creating…" : "Create Tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceSessionsPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<UserDeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDeviceSessions(token);
      setSessions(data);
    } catch (e) {
      toast({ title: "Error loading sessions", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleClear = async (userId: string) => {
    setClearing(userId);
    try {
      await clearDeviceSessions(token, userId);
      toast({ title: "Sessions cleared", description: "User can now log in again." });
      await load();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setClearing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
            Device <span className="text-primary">Sessions</span>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Users are limited to 3 devices. Suspended accounts appear in red. Clear sessions to unsuspend.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="text-xs font-semibold">
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {sessions.length === 0 && !loading && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-muted-foreground text-sm">
          No device sessions yet.
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <div
            key={s.userId}
            className={`bg-white border rounded-2xl p-5 shadow-sm ${s.suspended ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Monitor className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="font-semibold text-sm text-foreground truncate">
                    {s.email ?? "(no email found)"}
                  </span>
                  <span className="font-mono text-xs text-gray-400 truncate">{s.userId}</span>
                  {s.suspended ? (
                    <span className="shrink-0 text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">SUSPENDED</span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{s.deviceCount} / 3 devices</span>
                  )}
                </div>
                <div className="mt-3 space-y-2">
                  {s.devices.map((d) => (
                    <div
                      key={d.deviceId}
                      className="text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 bg-gray-50 rounded-lg p-3"
                    >
                      <span>
                        <span className="text-gray-400 font-semibold">Device: </span>
                        {d.deviceType}
                      </span>
                      <span>
                        <span className="text-gray-400 font-semibold">Browser: </span>
                        {d.browser}
                      </span>
                      <span>
                        <span className="text-gray-400 font-semibold">OS: </span>
                        {d.os}
                      </span>
                      <span>
                        <span className="text-gray-400 font-semibold">IP: </span>
                        <span className="font-mono">{d.ipAddress ?? "unknown"}</span>
                      </span>
                      <span>
                        <span className="text-gray-400 font-semibold">Last active: </span>
                        {formatRelativeTime(d.lastSeenAt)}
                      </span>
                      <span>
                        <span className="text-gray-400 font-semibold">Login time: </span>
                        {new Date(d.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClear(s.userId)}
                disabled={clearing === s.userId}
                className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 font-semibold text-xs gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearing === s.userId ? "Clearing…" : "Clear Sessions"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersPanel({ token, products }: { token: string; products: ProductWithServers[] }) {
  const { toast } = useToast();

  // Search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClerkUserResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Create user
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [creating, setCreating] = useState(false);

  // Grant
  const [grantUserId, setGrantUserId] = useState("");
  const [grantProductId, setGrantProductId] = useState<number | "">("");
  const [grantDuration, setGrantDuration] = useState<1 | 3 | 12>(1);
  const [grantServerId, setGrantServerId] = useState<number | "">("");
  const [granting, setGranting] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await searchUsers(token, query.trim());
      setResults(data);
    } catch (e) {
      toast({ title: "Search failed", description: String(e), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const doCreate = async () => {
    if (!newEmail.trim() || !newPassword) return;
    setCreating(true);
    try {
      const user = await createUser(token, {
        emailAddress: newEmail.trim(),
        password: newPassword,
        firstName: newFirstName.trim() || undefined,
        lastName: newLastName.trim() || undefined,
      });
      toast({ title: "User created", description: user.email ?? user.id });
      setGrantUserId(user.id);
      setNewEmail("");
      setNewPassword("");
      setNewFirstName("");
      setNewLastName("");
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const doGrant = async () => {
    if (!grantUserId.trim() || !grantProductId) return;
    setGranting(true);
    try {
      await grantEntitlement(token, {
        clerkUserId: grantUserId.trim(),
        productId: grantProductId,
        durationMonths: grantDuration,
        serverId: grantServerId || null,
      });
      toast({ title: "Access granted", description: `Entitlement created for ${grantUserId.trim()}.` });
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setGranting(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === grantProductId);

  return (
    <div className="space-y-8">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" /> Find a User
        </h3>
        <div className="flex gap-2 mb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Search by email or name…"
          />
          <Button onClick={doSearch} disabled={searching} className="shrink-0">
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>
        <div className="space-y-2">
          {results.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50 text-sm"
            >
              <div>
                <div className="font-semibold">{u.email ?? "(no email)"}</div>
                <div className="text-xs text-gray-500 font-mono">{u.id}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setGrantUserId(u.id)}
              >
                Use for Grant
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> Create User
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Input
            type="password"
            placeholder="Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            placeholder="First name (optional)"
            value={newFirstName}
            onChange={(e) => setNewFirstName(e.target.value)}
          />
          <Input
            placeholder="Last name (optional)"
            value={newLastName}
            onChange={(e) => setNewLastName(e.target.value)}
          />
        </div>
        <Button onClick={doCreate} disabled={creating || !newEmail.trim() || !newPassword} className="font-bold">
          {creating ? "Creating…" : "Create User"}
        </Button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary" /> Grant Access (no payment)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Clerk User ID
            </label>
            <Input
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              placeholder="user_xxxxxxxx"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Product
            </label>
            <select
              className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm"
              value={grantProductId}
              onChange={(e) => {
                setGrantProductId(e.target.value ? Number(e.target.value) : "");
                setGrantServerId("");
              }}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Duration
            </label>
            <select
              className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm"
              value={grantDuration}
              onChange={(e) => setGrantDuration(Number(e.target.value) as 1 | 3 | 12)}
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={12}>12 months</option>
            </select>
          </div>

          {selectedProduct && selectedProduct.servers.length > 0 && (
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Assign Server (optional)
              </label>
              <select
                className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm"
                value={grantServerId}
                onChange={(e) => setGrantServerId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Auto (first available)</option>
                {selectedProduct.servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <Button
          onClick={doGrant}
          disabled={granting || !grantUserId.trim() || !grantProductId}
          className="bg-primary hover:bg-primary/90 text-white font-bold"
        >
          {granting ? "Granting…" : "Grant Access"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") ?? "");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [products, setProducts] = useState<ProductWithServers[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"tools" | "devices" | "users">("tools");
  const [addToolOpen, setAddToolOpen] = useState(false);
  const { toast } = useToast();

  const authenticated = !!token;

  const load = async (t: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchProducts(t);
      setProducts(data);
      sessionStorage.setItem("admin_token", t);
      setToken(t);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unauthorized") || msg.includes("401") || msg.includes("Wrong")) {
        setError("Wrong username or password.");
        setToken("");
        sessionStorage.removeItem("admin_token");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load(token);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput) return;
    const t = makeBasicAuth(usernameInput.trim(), passwordInput);
    load(t);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Admin Login</h1>
            <p className="text-sm text-muted-foreground">SubsHub backend panel</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Username
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="pl-10"
                />
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoComplete="current-password"
                  className="pl-10 pr-10"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || !usernameInput.trim() || !passwordInput}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 rounded-xl mt-2"
            >
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8F9]">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between max-w-5xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-heading font-bold text-foreground text-lg uppercase tracking-wide">
              SubsHub Admin
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600 font-semibold text-sm"
            onClick={() => {
              sessionStorage.removeItem("admin_token");
              setToken("");
            }}
          >
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="flex gap-1 mt-6 mb-8 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("tools")}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "tools" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Tools &amp; Pricing
          </button>
          <button
            onClick={() => setTab("users")}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "users" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Users
          </button>
          <button
            onClick={() => setTab("devices")}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "devices" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Device Sessions
          </button>
        </div>
      </div>

      <main className="container mx-auto px-4 md:px-6 pb-10 max-w-5xl">
        {tab === "tools" && (
          <>
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
                  Tools <span className="text-primary">&amp; Pricing</span>
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Manage tiered pricing and one or more server credential sets per tool.
                </p>
              </div>
              <Button
                onClick={() => setAddToolOpen(true)}
                className="bg-primary hover:bg-primary/90 text-white font-bold gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add New Tool
              </Button>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {products.map((p) => (
                <ToolConfigCard
                  key={p.id}
                  product={p}
                  token={token}
                  onSaved={() => {
                    load(token);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {tab === "users" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
                User <span className="text-primary">Management</span>
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Search existing users, create new accounts, or grant tool access without payment.
              </p>
            </div>
            <UsersPanel token={token} products={products} />
          </>
        )}

        {tab === "devices" && <DeviceSessionsPanel token={token} />}
      </main>

      <AddToolDialog
        open={addToolOpen}
        onOpenChange={setAddToolOpen}
        token={token}
        onCreated={() => load(token)}
      />
    </div>
  );
}
