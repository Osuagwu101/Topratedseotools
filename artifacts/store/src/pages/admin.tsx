import { useState, useEffect, useRef } from "react";
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
import TrustAdminPanel, { type TrustAdminTab } from "@/components/admin/TrustAdminPanel";
import HomepageAdminPanel, { type HomeTab } from "@/components/admin/HomepageAdminPanel";
import BlogAdminPanel, { type BlogAdminTab } from "@/components/admin/BlogAdminPanel";
import DashboardPanel from "@/components/admin/DashboardPanel";
import SystemConfigPanel from "@/components/admin/SystemConfigPanel";
import PaymentAdminPanel from "@/components/admin/PaymentAdminPanel";
import AiConfigPanel from "@/components/admin/AiConfigPanel";
import EmailConfigPanel from "@/components/admin/EmailConfigPanel";
import FeatureManagementPanel from "@/components/admin/FeatureManagementPanel";
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
  Palette,
  RefreshCw,
  BarChart3,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Menu,
  LayoutDashboard,
  Wrench,
  Users,
  FileText,
  LogOut,
  ChevronDown,
  KeyRound,
  CreditCard,
  Sparkles,
  Mail,
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
  featuredOrder?: number | null;
  homepageBlurb?: string | null;
  crossSellProductIds?: number[];
  upSellProductIds?: number[];
  downSellProductIds?: number[];
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
  body: {
    name?: string;
    description?: string;
    fullDescription?: string | null;
    category?: string;
    billingPeriod?: string;
    crossSellProductIds?: number[];
    upSellProductIds?: number[];
    downSellProductIds?: number[];
  },
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

function ProductMultiSelect({
  label,
  hint,
  allProducts,
  currentProductId,
  selectedIds,
  onChange,
}: {
  label: string;
  hint: string;
  allProducts: ProductWithServers[];
  currentProductId: number;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const options = allProducts.filter((p) => p.id !== currentProductId);
  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id],
    );
  };
  return (
    <div>
      <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
        {label} <span className="normal-case text-gray-400">({hint})</span>
      </label>
      <div className="flex flex-wrap gap-2 p-3 rounded-md border border-input bg-background max-h-40 overflow-y-auto">
        {options.length === 0 && (
          <span className="text-xs text-gray-400 italic">No other tools available yet</span>
        )}
        {options.map((p) => {
          const active = selectedIds.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailsEditor({
  product,
  allProducts,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  allProducts: ProductWithServers[];
  token: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [fullDescription, setFullDescription] = useState(product.fullDescription ?? "");
  const [category, setCategory] = useState(product.category ?? "");
  const [billingPeriod, setBillingPeriod] = useState(product.billingPeriod);
  const [crossSellProductIds, setCrossSellProductIds] = useState<number[]>(product.crossSellProductIds ?? []);
  const [upSellProductIds, setUpSellProductIds] = useState<number[]>(product.upSellProductIds ?? []);
  const [downSellProductIds, setDownSellProductIds] = useState<number[]>(product.downSellProductIds ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(product.name);
    setDescription(product.description ?? "");
    setFullDescription(product.fullDescription ?? "");
    setCategory(product.category ?? "");
    setBillingPeriod(product.billingPeriod);
    setCrossSellProductIds(product.crossSellProductIds ?? []);
    setUpSellProductIds(product.upSellProductIds ?? []);
    setDownSellProductIds(product.downSellProductIds ?? []);
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
        crossSellProductIds,
        upSellProductIds,
        downSellProductIds,
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

      <div className="pt-2 border-t border-gray-100 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Cross-sell / Up-sell / Down-sell
        </p>
        <ProductMultiSelect
          label="Cross-sell"
          hint="complementary tools shown as 'You may also like'"
          allProducts={allProducts}
          currentProductId={product.id}
          selectedIds={crossSellProductIds}
          onChange={setCrossSellProductIds}
        />
        <ProductMultiSelect
          label="Up-sell"
          hint="premium alternative shown as 'Upgrade to'"
          allProducts={allProducts}
          currentProductId={product.id}
          selectedIds={upSellProductIds}
          onChange={setUpSellProductIds}
        />
        <ProductMultiSelect
          label="Down-sell"
          hint="cheaper alternative shown as 'Or try instead'"
          allProducts={allProducts}
          currentProductId={product.id}
          selectedIds={downSellProductIds}
          onChange={setDownSellProductIds}
        />
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
  allProducts,
  token,
  onSaved,
}: {
  product: ProductWithServers;
  allProducts: ProductWithServers[];
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
      const hasSavedAutoLoginServer = servers.some(
        (s) => s.id && s.isAutoLogin && s.loginUrl && s.username && s.password,
      );
      if (!hasSavedAutoLoginServer) {
        toast({
          title: "Save an Auto-Login server first",
          description:
            "Check \"Auto-Login\" on a server below, fill in the login URL/username/password, and click that server's Save button — before enabling One-Click Auth.",
          variant: "destructive",
        });
        return;
      }
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
        <DetailsEditor product={product} allProducts={allProducts} token={token} onSaved={onSaved} />
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

interface SiteSettingsData {
  id: number;
  siteLogoUrl: string | null;
  siteHeadline: string;
  siteSubheadline: string;
  paymentFooterText: string;
  copyrightText: string;
  copyrightYear: string;
  useDynamicCopyrightYear: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

function BrandingPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [paymentFooter, setPaymentFooter] = useState("");
  const [copyrightText, setCopyrightText] = useState("");
  const [copyrightYear, setCopyrightYear] = useState("");
  const [useDynamic, setUseDynamic] = useState(true);

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API}/admin/site-settings`, {
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as SiteSettingsData;
      setSettings(data);
      setHeadline(data.siteHeadline);
      setSubheadline(data.siteSubheadline);
      setPaymentFooter(data.paymentFooterText);
      setCopyrightText(data.copyrightText);
      setCopyrightYear(data.copyrightYear);
      setUseDynamic(data.useDynamicCopyrightYear);
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a PNG, JPG, WebP, or SVG image.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 8 MB.", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append("logo", logoFile);
      const res = await fetch(`${API}/admin/site-settings/logo`, {
        method: "POST",
        headers: { Authorization: token },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { siteLogoUrl: string };
      setSettings((prev) => prev ? { ...prev, siteLogoUrl: data.siteLogoUrl } : prev);
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: "Logo updated", description: "Site logo has been updated successfully." });
      window.location.reload();
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const res = await fetch(`${API}/admin/site-settings/logo`, {
        method: "DELETE",
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(await res.text());
      setSettings((prev) => prev ? { ...prev, siteLogoUrl: null } : prev);
      toast({ title: "Logo removed", description: "The site logo has been removed." });
      window.location.reload();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  const handleSaveText = async () => {
    if (!headline.trim()) { toast({ title: "Headline cannot be empty", variant: "destructive" }); return; }
    if (!subheadline.trim()) { toast({ title: "Subheadline cannot be empty", variant: "destructive" }); return; }
    if (!copyrightText.trim()) { toast({ title: "Copyright text cannot be empty", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/admin/site-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          siteHeadline: headline.trim(),
          siteSubheadline: subheadline.trim(),
          paymentFooterText: paymentFooter.trim(),
          copyrightText: copyrightText.trim(),
          copyrightYear: copyrightYear.trim(),
          useDynamicCopyrightYear: useDynamic,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json() as SiteSettingsData;
      setSettings(updated);
      toast({ title: "Branding settings saved", description: "Website branding settings updated successfully." });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!settings) return;
    setHeadline(settings.siteHeadline);
    setSubheadline(settings.siteSubheadline);
    setPaymentFooter(settings.paymentFooterText);
    setCopyrightText(settings.copyrightText);
    setCopyrightYear(settings.copyrightYear);
    setUseDynamic(settings.useDynamicCopyrightYear);
    setLogoFile(null);
    setLogoPreview(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentLogoUrl = settings?.siteLogoUrl ?? null;
  const previewCopyrightYear = useDynamic ? String(new Date().getFullYear()) : copyrightYear;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
          Website <span className="text-primary">Branding</span>
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage the site logo, headline, subheadline, footer text, and copyright information.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-base mb-4 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          Site Logo
        </h3>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-48 h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
            {logoPreview ? (
              <img src={logoPreview} alt="Preview" className="h-full w-full object-contain p-2" />
            ) : currentLogoUrl ? (
              <img src={currentLogoUrl} alt="Current logo" className="h-full w-full object-contain p-2" />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">No logo uploaded</span>
            )}
          </div>

          <div className="flex flex-col gap-3 flex-1">
            <p className="text-sm text-muted-foreground">
              Accepted formats: PNG, JPG, JPEG, SVG, WebP. Max 8 MB.
              {currentLogoUrl && <span className="text-primary font-medium ml-1">A custom logo is currently active.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 font-bold"
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                {currentLogoUrl ? "Replace Logo" : "Upload Logo"}
              </Button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                className="hidden"
                onChange={handleLogoChange}
              />
              {logoFile && (
                <Button
                  size="sm"
                  className="gap-1.5 font-bold bg-primary hover:bg-primary/90 text-white"
                  onClick={handleLogoUpload}
                  disabled={logoUploading}
                >
                  {logoUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Logo
                </Button>
              )}
              {logoFile && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 font-bold text-muted-foreground"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              )}
              {currentLogoUrl && !logoFile && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 font-bold text-red-500 hover:text-red-600"
                  onClick={handleRemoveLogo}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove Logo
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-base flex items-center gap-2">
          <PencilLine className="w-4 h-4 text-primary" />
          Homepage Text
        </h3>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Main Headline
          </label>
          <Input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Everything You Need to Get More Done with AI"
            className="font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Subheadline / Description
          </label>
          <Textarea
            value={subheadline}
            onChange={(e) => setSubheadline(e.target.value)}
            placeholder="Access premium AI tools…"
            rows={3}
            className="font-medium resize-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-base flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          Footer &amp; Copyright
        </h3>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Payment Footer Text
          </label>
          <Input
            value={paymentFooter}
            onChange={(e) => setPaymentFooter(e.target.value)}
            placeholder="All payments are securely processed with Paystack's end-to-end encryption."
            className="font-medium"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
            Copyright Name
          </label>
          <Input
            value={copyrightText}
            onChange={(e) => setCopyrightText(e.target.value)}
            placeholder="Top Rated SEO Tools"
            className="font-medium"
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={useDynamic}
            onCheckedChange={setUseDynamic}
            id="dynamic-year"
          />
          <label htmlFor="dynamic-year" className="text-sm font-semibold cursor-pointer">
            Automatically use the current year
          </label>
        </div>

        {!useDynamic && (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 block">
              Copyright Year
            </label>
            <Input
              value={copyrightYear}
              onChange={(e) => setCopyrightYear(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              className="font-medium w-32"
            />
          </div>
        )}

        <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-muted-foreground border border-gray-100">
          <span className="font-semibold text-foreground">Preview: </span>
          &copy; {previewCopyrightYear} {copyrightText}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="font-bold" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          className="bg-primary hover:bg-primary/90 text-white font-bold gap-2"
          onClick={handleSaveText}
          disabled={saving}
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Branding Settings
        </Button>
      </div>
    </div>
  );
}

interface IntegrationSettingsResponse {
  metaPixel: { enabled: boolean; pixelId: string | null };
  metaCapi: {
    enabled: boolean;
    pixelId: string | null;
    tokenConfigured: boolean;
    maskedToken: string | null;
    testEventCode: string | null;
    siteUrl: string | null;
  };
  googleTagManager: { enabled: boolean; containerId: string | null };
  updatedAt: string | null;
  updatedBy: string | null;
}

type AnalyticsSubPage = "all" | "facebook" | "gtm";

function AnalyticsPanel({
  token,
  subPage: controlledSubPage,
  onSubPageChange,
}: {
  token: string;
  subPage?: AnalyticsSubPage;
  onSubPageChange?: (page: AnalyticsSubPage) => void;
}) {
  const { toast } = useToast();
  const authHeaders = { Authorization: token };

  type SubPage = AnalyticsSubPage;
  const [internalSubPage, setInternalSubPage] = useState<SubPage>("all");
  const subPage = controlledSubPage ?? internalSubPage;
  const setSubPage = (page: SubPage) => {
    if (onSubPageChange) onSubPageChange(page);
    else setInternalSubPage(page);
  };

  const [settings, setSettings] = useState<IntegrationSettingsResponse | null>(null);
  const [events, setEvents] = useState<Array<{
    id: number; eventId: string; eventName: string;
    reference: string | null; status: string;
    errorMessage: string | null; createdAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const [pixelEnabled, setPixelEnabled] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [pixelSaving, setPixelSaving] = useState(false);
  const [pixelError, setPixelError] = useState("");

  const [capiEnabled, setCapiEnabled] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [capiSaving, setCapiSaving] = useState(false);
  const [capiError, setCapiError] = useState("");
  const [capiTesting, setCapiTesting] = useState(false);
  const [capiTestResult, setCapiTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [gtmEnabled, setGtmEnabled] = useState(false);
  const [containerId, setContainerId] = useState("");
  const [gtmSaving, setGtmSaving] = useState(false);
  const [gtmError, setGtmError] = useState("");

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/integrations", { headers: authHeaders }).then((r) => r.json()),
      fetch("/api/admin/analytics/events", { headers: authHeaders }).then((r) => r.json()),
    ])
      .then(([s, e]) => {
        const cfg = s as IntegrationSettingsResponse;
        setSettings(cfg);
        setPixelEnabled(cfg.metaPixel.enabled);
        setPixelId(cfg.metaPixel.pixelId ?? "");
        setCapiEnabled(cfg.metaCapi.enabled);
        setAccessToken("");
        setTestEventCode(cfg.metaCapi.testEventCode ?? "");
        setSiteUrl(cfg.metaCapi.siteUrl ?? "");
        setGtmEnabled(cfg.googleTagManager.enabled);
        setContainerId(cfg.googleTagManager.containerId ?? "");
        setEvents(Array.isArray(e) ? e : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePixelAndCapi = async () => {
    setPixelError("");
    setCapiError("");
    const tid = pixelId.trim();
    if (tid && !/^\d+$/.test(tid)) {
      setPixelError("Pixel ID must be numeric (e.g. 1371893314574468)");
      return;
    }
    const url = siteUrl.trim().replace(/\/$/, "");
    if (url && !/^https?:\/\/.+/.test(url)) {
      setCapiError("Site URL must start with https://");
      return;
    }
    setPixelSaving(true);
    setCapiSaving(true);
    try {
      const pixelRes = await fetch("/api/admin/integrations/meta-pixel", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ enabled: pixelEnabled, pixelId: tid || null }),
      });
      const pixelD = await pixelRes.json() as { error?: string };
      if (!pixelRes.ok) { setPixelError(pixelD.error ?? "Save failed"); return; }

      const capiBody: Record<string, unknown> = {
        enabled: capiEnabled,
        testEventCode: testEventCode.trim() || null,
        siteUrl: url || null,
      };
      if (accessToken.trim()) capiBody.accessToken = accessToken.trim();
      const capiRes = await fetch("/api/admin/integrations/meta-capi", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(capiBody),
      });
      const capiD = await capiRes.json() as { error?: string };
      if (!capiRes.ok) { setCapiError(capiD.error ?? "Save failed"); return; }

      toast({ title: "Facebook Pixel settings saved" });
      setAccessToken("");
      loadData();
    } catch { setPixelError("Network error. Please try again."); }
    finally { setPixelSaving(false); setCapiSaving(false); }
  };

  const saveGtm = async () => {
    setGtmError("");
    const cid = containerId.trim().toUpperCase();
    if (cid && !/^GTM-[A-Z0-9]+$/.test(cid)) {
      setGtmError("Container ID must start with GTM- (e.g. GTM-XXXXXXX)");
      return;
    }
    setGtmSaving(true);
    try {
      const res = await fetch("/api/admin/integrations/google-tag-manager", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ enabled: gtmEnabled, containerId: cid || null }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) setGtmError(d.error ?? "Save failed");
      else { toast({ title: "GTM settings saved" }); loadData(); }
    } catch { setGtmError("Network error. Please try again."); }
    finally { setGtmSaving(false); }
  };

  const sendTestEvent = async () => {
    setCapiTestResult(null);
    setCapiTesting(true);
    try {
      const res = await fetch("/api/admin/integrations/meta-capi/test", {
        method: "POST",
        headers: authHeaders,
      });
      const d = await res.json() as { ok: boolean; reason?: string };
      if (d.ok) {
        setCapiTestResult({ ok: true, message: "Test event sent successfully. Check Meta Events Manager under Test Events." });
        loadData();
      } else {
        setCapiTestResult({ ok: false, message: d.reason ?? "Test event failed. Check server logs." });
      }
    } catch { setCapiTestResult({ ok: false, message: "Network error. Please try again." }); }
    finally { setCapiTesting(false); }
  };

  const getIntegrationStatus = (enabled: boolean, configured: boolean) => {
    if (!enabled) return "disabled" as const;
    if (!configured) return "incomplete" as const;
    return "active" as const;
  };

  const facebookStatus = getIntegrationStatus(
    pixelEnabled || capiEnabled,
    !!(settings?.metaPixel.pixelId || settings?.metaCapi.pixelId)
  );
  const gtmStatus = getIntegrationStatus(gtmEnabled, !!settings?.googleTagManager.containerId);

  const StatusDot = ({ status }: { status: "active" | "disabled" | "incomplete" }) => {
    if (status === "active") return <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />;
    if (status === "incomplete") return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />;
    return <span className="inline-block w-2 h-2 rounded-full bg-gray-300 shrink-0" />;
  };

  const TrackList = ({ items }: { items: string[] }) => (
    <ul className="space-y-2 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );

  const capiTestReady = !!(
    settings?.metaCapi.enabled &&
    settings.metaCapi.pixelId &&
    settings.metaCapi.tokenConfigured &&
    settings.metaCapi.siteUrl &&
    settings.metaCapi.testEventCode
  );
  const isFbSaving = pixelSaving || capiSaving;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  const navItems: { key: SubPage; label: string }[] = [
    { key: "all", label: "All Integrations" },
    { key: "facebook", label: "Facebook Pixel + Conv API" },
    { key: "gtm", label: "Google Tag Manager" },
  ];

  return (
    <div className="flex bg-white rounded-xl border border-border overflow-hidden" style={{ minHeight: 520 }}>
      {/* ── Left sidebar ──────────────────────────────────────────── */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col bg-[#fafafa]">
        <div className="px-4 py-4 border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Analytics</p>
        </div>
        <nav className="flex-1 py-2">
          {navItems.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSubPage(key)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                subPage === key
                  ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                  : "text-foreground hover:bg-gray-100"
              }`}
            >
              {key === "facebook" && <StatusDot status={facebookStatus} />}
              {key === "gtm" && <StatusDot status={gtmStatus} />}
              {key === "all" && <span className="w-2 shrink-0" />}
              <span className="leading-snug">{label}</span>
            </button>
          ))}
        </nav>
        {settings?.updatedAt && (
          <div className="px-4 py-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Last saved<br />
              {new Date(settings.updatedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-auto">

        {/* ALL INTEGRATIONS ───────────────────────────────────────── */}
        {subPage === "all" && (
          <div className="p-8">
            <h2 className="text-xl font-bold text-foreground mb-1">All Integrations</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Connect analytics and marketing tools to your store. Changes take effect immediately — no rebuild required.
            </p>
            <div className="space-y-3">
              {[
                {
                  key: "facebook" as SubPage,
                  title: "Facebook Pixel + Conv API",
                  desc: "Track purchases, checkouts, and page views via browser pixel and server-side Conversions API.",
                  status: facebookStatus,
                },
                {
                  key: "gtm" as SubPage,
                  title: "Google Tag Manager",
                  desc: "Push store events to Google Analytics, Google Ads, and other tools via GTM triggers.",
                  status: gtmStatus,
                },
              ].map(({ key, title, desc, status }) => (
                <button
                  key={key}
                  onClick={() => setSubPage(key)}
                  className="w-full text-left flex items-center justify-between px-5 py-4 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={status} />
                    <div>
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    status === "active" ? "bg-green-100 text-green-700" :
                    status === "incomplete" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {status === "active" ? "Active" : status === "incomplete" ? "Incomplete" : "Disabled"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FACEBOOK PIXEL + CONV API ─────────────────────────────── */}
        {subPage === "facebook" && (
          <div className="p-8 space-y-6">
            <h2 className="text-xl font-bold text-foreground">Facebook Pixel Integration</h2>

            {/* Main config card */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* Left: description */}
                <div className="p-6 border-b lg:border-b-0 lg:border-r border-border bg-gray-50/40">
                  <p className="font-semibold text-sm text-foreground mb-1">
                    Integrate Facebook Pixel on your store
                  </p>
                  <p className="text-xs text-primary font-medium mb-1">What your Facebook Pixel tracks:</p>
                  <TrackList items={[
                    "Profile and product page views",
                    "Add to cart / product views",
                    "Initiate Checkout — when the user attempts to checkout",
                    "Purchase — when a user successfully pays for your product",
                  ]} />
                </div>

                {/* Right: form */}
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                      Pixel ID <span className="normal-case font-normal text-muted-foreground">(Facebook Events Manager)</span>
                    </label>
                    <Input
                      value={pixelId}
                      onChange={(e) => { setPixelId(e.target.value); setPixelError(""); }}
                      placeholder="e.g. 1371893314574468"
                      className="font-mono text-sm"
                    />
                    {pixelError && <p className="text-xs text-red-600 mt-1.5">{pixelError}</p>}
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <input
                      type="checkbox"
                      id="capi-toggle"
                      checked={capiEnabled}
                      onChange={(e) => setCapiEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
                    />
                    <label htmlFor="capi-toggle" className="text-sm font-medium cursor-pointer select-none">
                      Enable Conversion API
                    </label>
                  </div>

                  {capiEnabled && (
                    <div className="space-y-3 pt-1 border-t border-border/60">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                          Conversions API Access Token
                        </label>
                        <div className="relative">
                          <Input
                            type={showToken ? "text" : "password"}
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder={
                              settings?.metaCapi.tokenConfigured
                                ? (settings.metaCapi.maskedToken ?? "••••••••••••abcd")
                                : "Paste your access token here"
                            }
                            className="font-mono text-sm pr-10"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken((v) => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {settings?.metaCapi.tokenConfigured && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Token saved. Leave blank to keep existing, or paste a new one to replace it.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                          Test Event Code <span className="normal-case font-normal text-muted-foreground">(optional)</span>
                        </label>
                        <Input
                          value={testEventCode}
                          onChange={(e) => setTestEventCode(e.target.value)}
                          placeholder="e.g. TEST12345"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">
                          Production Site URL
                        </label>
                        <Input
                          value={siteUrl}
                          onChange={(e) => { setSiteUrl(e.target.value); setCapiError(""); }}
                          placeholder="https://topratedseotools.com"
                          type="url"
                        />
                        {capiError && <p className="text-xs text-red-600 mt-1.5">{capiError}</p>}
                      </div>
                    </div>
                  )}

                  {capiTestResult && (
                    <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 border ${capiTestResult.ok ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                      {capiTestResult.ok
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                      <span className="text-xs">{capiTestResult.message}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                    {capiEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={sendTestEvent}
                        disabled={capiTesting || !capiTestReady}
                        className="text-xs"
                        title={!capiTestReady ? "Requires Pixel ID, access token, site URL, and test event code" : undefined}
                      >
                        {capiTesting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Sending…</> : "Send Test Event"}
                      </Button>
                    )}
                    <Button
                      onClick={savePixelAndCapi}
                      disabled={isFbSaving}
                      className="ml-auto font-bold"
                    >
                      {isFbSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Update Pixel"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* CAPI events table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-gray-50/40">
                <div>
                  <h3 className="text-sm font-bold">Recent CAPI Events</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Last 50 server-side events sent to Meta Conversions API</p>
                </div>
                <Button variant="ghost" size="sm" onClick={loadData} className="h-7 px-2 text-xs font-bold">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Refresh
                </Button>
              </div>
              {events.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No CAPI events recorded yet. Events appear here after the first verified purchase or test event.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Event</th>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Reference</th>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {events.map((ev) => (
                        <tr key={ev.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold">{ev.eventName}</td>
                          <td className="px-4 py-3 font-mono text-muted-foreground">{ev.reference ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-semibold">
                              {ev.status === "sent" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                              {ev.status === "failed" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                              {ev.status === "sending" && <Clock className="w-3.5 h-3.5 text-yellow-500" />}
                              {ev.status}
                            </span>
                            {ev.errorMessage && (
                              <p className="text-red-500 text-[10px] mt-0.5 max-w-[180px] truncate" title={ev.errorMessage}>
                                {ev.errorMessage}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {new Date(ev.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* GOOGLE TAG MANAGER ─────────────────────────────────────── */}
        {subPage === "gtm" && (
          <div className="p-8 space-y-6">
            <h2 className="text-xl font-bold text-foreground">Google Tag Manager Integration</h2>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* Left: description */}
                <div className="p-6 border-b lg:border-b-0 lg:border-r border-border bg-gray-50/40">
                  <p className="font-semibold text-sm text-foreground mb-1">
                    Integrate Google Tag Manager on your store
                  </p>
                  <p className="text-xs text-primary font-medium mb-1">What you can do with Google Tag Manager:</p>
                  <TrackList items={[
                    "Connect your Google Analytics to track page views and traffic sources",
                    "Use Google Tag Manager to add other script tags to your store",
                    "Track store events to push to Google Analytics or Google Ads",
                    "Create Custom Event triggers on Google Analytics with the following event names:",
                  ]} />
                  <div className="mt-3 space-y-1.5 pl-6">
                    {[
                      { name: "TopRated_AddToCart", desc: "When user views a product" },
                      { name: "TopRated_InitiateCheckout", desc: "When user enters their details and initiates checkout" },
                      { name: "TopRated_Purchase", desc: "When user purchases a product" },
                    ].map(({ name, desc }) => (
                      <p key={name} className="text-[12px] text-muted-foreground flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <span><span className="font-mono text-primary font-semibold">- {name}</span> — {desc}</span>
                      </p>
                    ))}
                  </div>
                </div>

                {/* Right: form */}
                <div className="p-6 flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">GTM_ID</label>
                    <Input
                      value={containerId}
                      onChange={(e) => { setContainerId(e.target.value.toUpperCase()); setGtmError(""); }}
                      placeholder="<!-- Google tag (gtag.js) -->"
                      className="font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Enter your Container ID (e.g. GTM-XXXXXXX) from your Google Tag Manager workspace.
                    </p>
                    {gtmError && <p className="text-xs text-red-600 mt-1.5">{gtmError}</p>}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="gtm-toggle"
                      checked={gtmEnabled}
                      onChange={(e) => setGtmEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary accent-primary cursor-pointer"
                    />
                    <label htmlFor="gtm-toggle" className="text-sm font-medium cursor-pointer select-none">
                      Enable Google Tag Manager
                    </label>
                  </div>

                  <div className="flex justify-end pt-2 mt-auto">
                    <Button onClick={saveGtm} disabled={gtmSaving} className="font-bold">
                      {gtmSaving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Update GTM"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
  const [tab, setTab] = useState<"dashboard" | "tools" | "devices" | "users" | "branding" | "analytics" | "trust" | "homepage" | "blog" | "system-config" | "payments-admin" | "ai-config" | "email-config" | "feature-management">("dashboard");
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedNavKey, setExpandedNavKey] = useState<string | null>(null);
  const [blogSubTab, setBlogSubTab] = useState<BlogAdminTab>("posts");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubPage>("all");
  const [homeSubTab, setHomeSubTab] = useState<HomeTab>("hero");
  const [trustSubTab, setTrustSubTab] = useState<TrustAdminTab>("contact");
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
            <p className="text-sm text-muted-foreground">Top Rated SEO Tools backend panel</p>
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

  const navItems: {
    key: typeof tab;
    label: string;
    icon: typeof Wrench;
    children?: { key: string; label: string }[];
  }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "tools", label: "Tools & Pricing", icon: Wrench },
    { key: "users", label: "Users", icon: Users },
    { key: "devices", label: "Device Sessions", icon: Monitor },
    { key: "branding", label: "Branding", icon: Palette },
    {
      key: "homepage",
      label: "Homepage",
      icon: ImageIcon,
      children: [
        { key: "hero", label: "Hero" },
        { key: "seo", label: "SEO" },
        { key: "popular", label: "Popular Tools" },
        { key: "benefits", label: "Benefits" },
        { key: "steps", label: "How It Works" },
        { key: "faq", label: "FAQ" },
      ],
    },
    {
      key: "analytics",
      label: "Analytics",
      icon: BarChart3,
      children: [
        { key: "all", label: "All Integrations" },
        { key: "facebook", label: "Facebook Pixel + Conv API" },
        { key: "gtm", label: "Google Tag Manager" },
      ],
    },
    {
      key: "trust",
      label: "Trust & Support",
      icon: ShieldCheck,
      children: [
        { key: "contact", label: "Contact Information" },
        { key: "support", label: "Support Page" },
        { key: "whatsapp", label: "WhatsApp Support" },
        { key: "testimonials", label: "Testimonials" },
        { key: "assignments", label: "Assignments" },
        { key: "reviews", label: "Purchase Reviews" },
        { key: "counter", label: "Customer Counter" },
        { key: "payments", label: "Payment Methods" },
      ],
    },
    {
      key: "blog",
      label: "Blog",
      icon: FileText,
      children: [
        { key: "posts", label: "Posts" },
        { key: "taxonomy", label: "Categories & Tags" },
        { key: "media", label: "Media Library" },
        { key: "comments", label: "Comments" },
        { key: "staff", label: "Staff" },
        { key: "settings", label: "Settings & Redirects" },
        { key: "ai-generator", label: "AI Generator" },
      ],
    },
    { key: "payments-admin", label: "Payment Management", icon: CreditCard },
    { key: "ai-config", label: "AI Configuration", icon: Sparkles },
    { key: "email-config", label: "Email Configuration", icon: Mail },
    { key: "system-config", label: "System Config", icon: KeyRound },
  ];

  const handleLogout = () => {
    sessionStorage.removeItem("admin_token");
    setToken("");
  };

  const handleNavItemClick = (key: typeof tab, hasChildren: boolean) => {
    if (hasChildren) {
      setExpandedNavKey((prev) => (prev === key ? null : key));
      return;
    }
    setTab(key);
    setMenuOpen(false);
  };

  const handleNavChildClick = (parentKey: typeof tab, childKey: string) => {
    setTab(parentKey);
    if (parentKey === "blog") setBlogSubTab(childKey as BlogAdminTab);
    if (parentKey === "analytics") setAnalyticsSubTab(childKey as AnalyticsSubPage);
    if (parentKey === "homepage") setHomeSubTab(childKey as HomeTab);
    if (parentKey === "trust") setTrustSubTab(childKey as TrustAdminTab);
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F7F8F9]">
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between max-w-5xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setExpandedNavKey(
                  tab === "blog" || tab === "analytics" || tab === "homepage" || tab === "trust" ? tab : null
                );
                setMenuOpen(true);
              }}
              className="p-2 -ml-2 rounded-lg text-foreground hover:bg-gray-100 transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <ShieldCheck className="w-5 h-5 text-primary hidden sm:block" />
            <span className="font-heading font-bold text-foreground text-lg uppercase tracking-wide">
              Top Rated SEO Tools Admin
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600 font-semibold text-sm"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </header>

      {/* ── Slide-in menu ─────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-30" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Menu</p>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 py-2 overflow-y-auto">
              {navItems.map(({ key, label, icon: Icon, children }) => {
                const isExpanded = expandedNavKey === key;
                const activeChildKey =
                  key === "blog"
                    ? blogSubTab
                    : key === "analytics"
                    ? analyticsSubTab
                    : key === "homepage"
                    ? homeSubTab
                    : key === "trust"
                    ? trustSubTab
                    : null;
                return (
                  <div key={key}>
                    <button
                      onClick={() => handleNavItemClick(key, !!children)}
                      className={`w-full text-left px-5 py-3 text-sm font-semibold transition-colors flex items-center gap-3 ${
                        tab === key && !children
                          ? "bg-primary/10 text-primary border-r-2 border-primary"
                          : tab === key && children
                          ? "text-primary"
                          : "text-foreground hover:bg-gray-50"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {children && (
                        <ChevronDown
                          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>
                    {children && isExpanded && (
                      <div className="bg-gray-50 py-1">
                        {children.map((child) => (
                          <button
                            key={child.key}
                            onClick={() => handleNavChildClick(key, child.key)}
                            className={`w-full text-left pl-12 pr-5 py-2.5 text-sm font-medium transition-colors ${
                              tab === key && activeChildKey === child.key
                                ? "text-primary font-semibold bg-primary/5 border-r-2 border-primary"
                                : "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                            }`}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            <div className="border-t border-gray-100 p-2">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-3 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 md:px-6 pt-6 pb-10 max-w-5xl">
        {tab === "dashboard" && <DashboardPanel token={token} />}

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
                  allProducts={products}
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

        {tab === "branding" && <BrandingPanel token={token} />}

        {tab === "analytics" && (
          <AnalyticsPanel token={token} subPage={analyticsSubTab} onSubPageChange={setAnalyticsSubTab} />
        )}

        {tab === "trust" && (
          <TrustAdminPanel token={token} activeTab={trustSubTab} onActiveTabChange={setTrustSubTab} />
        )}

        {tab === "homepage" && (
          <HomepageAdminPanel
            token={token}
            products={products}
            onProductsChanged={() => load(token)}
            activeTab={homeSubTab}
            onActiveTabChange={setHomeSubTab}
          />
        )}

        {tab === "blog" && (
          <BlogAdminPanel
            token={token}
            products={products.map((p) => ({ id: p.id, name: p.name, description: p.description ?? null }))}
            activeTab={blogSubTab}
            onActiveTabChange={setBlogSubTab}
          />
        )}

        {tab === "payments-admin" && <PaymentAdminPanel token={token} />}

        {tab === "ai-config" && <AiConfigPanel token={token} />}

        {tab === "email-config" && <EmailConfigPanel token={token} />}

        {tab === "system-config" && <SystemConfigPanel token={token} />}
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
