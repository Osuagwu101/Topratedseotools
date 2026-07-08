import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Save, ShieldCheck, Lock, Monitor, Trash2 } from "lucide-react";

interface Credential {
  id?: number;
  productId: number;
  username?: string | null;
  password?: string | null;
  loginUrl?: string | null;
  usernameField?: string | null;
  passwordField?: string | null;
  isAutoLogin?: boolean | null;
  notes?: string | null;
}

interface ProductWithCred {
  id: number;
  name: string;
  category?: string;
  credential: Credential | null;
}

interface DeviceEntry {
  deviceId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
}

interface UserDeviceSession {
  userId: string;
  deviceCount: number;
  devices: DeviceEntry[];
  suspended: boolean;
}

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

async function fetchProducts(secret: string): Promise<ProductWithCred[]> {
  const res = await fetch(`${API}/admin/products`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveCredential(secret: string, body: Credential): Promise<void> {
  const res = await fetch(`${API}/admin/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function fetchDeviceSessions(secret: string): Promise<UserDeviceSession[]> {
  const res = await fetch(`${API}/admin/device-sessions`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function clearDeviceSessions(secret: string, userId: string): Promise<void> {
  const res = await fetch(`${API}/admin/device-sessions/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(await res.text());
}

function CredentialRow({
  product,
  secret,
  onSaved,
}: {
  product: ProductWithCred;
  secret: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const cred = product.credential;
  const [form, setForm] = useState<Credential>({
    productId: product.id,
    username: cred?.username ?? "",
    password: cred?.password ?? "",
    loginUrl: cred?.loginUrl ?? "",
    usernameField: cred?.usernameField ?? "email",
    passwordField: cred?.passwordField ?? "password",
    isAutoLogin: cred?.isAutoLogin ?? false,
    notes: cred?.notes ?? "",
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Credential, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveCredential(secret, form);
      toast({ title: "Saved", description: `${product.name} credentials updated.` });
      onSaved();
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-lg text-foreground">{product.name}</h3>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={!!form.isAutoLogin}
            onChange={(e) => set("isAutoLogin", e.target.checked)}
          />
          <span className="text-primary">One-Click Auto-Login</span>
        </label>
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

      <div className="mt-5 flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-white font-bold h-10 px-6 rounded-xl gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function DeviceSessionsPanel({ secret }: { secret: string }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<UserDeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchDeviceSessions(secret);
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
      await clearDeviceSessions(secret, userId);
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
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="text-xs font-semibold"
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {sessions.length === 0 && !loading && (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-muted-foreground text-sm">
          No device sessions yet. Sessions appear when users make authenticated requests.
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
                  <span className="font-mono text-xs text-gray-500 truncate">{s.userId}</span>
                  {s.suspended ? (
                    <span className="shrink-0 text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      SUSPENDED
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {s.deviceCount} / 3 devices
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  {s.devices.map((d) => (
                    <div key={d.deviceId} className="text-xs text-gray-500 flex gap-3 flex-wrap">
                      <span className="font-mono">{d.ipAddress ?? "unknown IP"}</span>
                      <span className="text-gray-400 truncate max-w-xs">{d.userAgent?.slice(0, 60) ?? "unknown browser"}</span>
                      <span className="text-gray-400">last seen {new Date(d.lastSeenAt).toLocaleString()}</span>
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

export default function AdminPanel() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem("admin_secret") ?? "");
  const [secretInput, setSecretInput] = useState("");
  const [products, setProducts] = useState<ProductWithCred[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"credentials" | "devices">("credentials");
  const { toast } = useToast();

  const authenticated = !!secret;

  const load = async (s: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchProducts(s);
      setProducts(data);
      sessionStorage.setItem("admin_secret", s);
      setSecret(s);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Unauthorized") || msg.includes("401")) {
        setError("Wrong admin secret. Try again.");
        setSecret("");
        sessionStorage.removeItem("admin_secret");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (secret) load(secret);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    load(secretInput.trim());
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#F7F8F9] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mb-8">Enter your admin secret to continue</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="password"
              placeholder="Admin secret"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              autoFocus
              className="text-center"
            />
            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
            <Button
              type="submit"
              disabled={loading || !secretInput}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-11 rounded-xl"
            >
              {loading ? "Checking…" : "Enter"}
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
              sessionStorage.removeItem("admin_secret");
              setSecret("");
            }}
          >
            Logout
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="flex gap-1 mt-6 mb-8 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("credentials")}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "credentials" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Tool Credentials
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
        {tab === "credentials" && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
                Tool <span className="text-primary">Credentials</span>
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Set login credentials per tool. Active subscribers will see these on their dashboard.
                Enable "One-Click Auto-Login" for Phrasly and StealthWriter.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {products.map((p) => (
                <CredentialRow
                  key={p.id}
                  product={p}
                  secret={secret}
                  onSaved={() => {
                    toast({ title: "Refreshing…" });
                    load(secret);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {tab === "devices" && <DeviceSessionsPanel secret={secret} />}
      </main>
    </div>
  );
}
