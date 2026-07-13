import { useEffect, useState } from "react";
import { Users, ShoppingCart, Package, Wallet, CalendarRange, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, useCurrency } from "@/context/currency";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE_PATH}/api`;

interface DashboardStats {
  productsCount: number;
  customersCount: number;
  salesCount: number;
  totalEarningsKobo: number;
  range: { from: string | null; to: string | null } | null;
}

function formatInCurrency(kobo: number, code: string, rates: Record<string, number>): string {
  const meta = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  const rate = rates[code];
  if (rate === undefined) return "—";
  const noDecimals = new Set(["NGN", "TZS", "UGX", "XAF", "XOF", "RWF"]);
  const value = (kobo / 100) * rate;
  const decimals = noDecimals.has(code) ? 0 : 2;
  return `${meta.symbol}${value.toLocaleString("en", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export default function DashboardPanel({ token }: { token: string }) {
  const { rates, ratesReady } = useCurrency();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [earningsCurrency, setEarningsCurrency] = useState("NGN");

  const load = async (from?: string, to?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(`${API}/admin/dashboard/stats${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: token },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as DashboardStats;
      setStats(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilter = () => load(fromDate || undefined, toDate || undefined);

  const clearFilter = () => {
    setFromDate("");
    setToDate("");
    load();
  };

  const isFiltered = !!stats?.range;

  return (
    <>
      <div className="mb-8">
        <h2 className="text-2xl font-heading font-bold text-foreground uppercase">
          Dashboard
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          A snapshot of your store's performance.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Summary cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-border p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">All Products</p>
                <p className="text-2xl font-heading font-bold text-foreground">{stats?.productsCount ?? 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isFiltered ? "Sales (filtered)" : "All Sales"}
                </p>
                <p className="text-2xl font-heading font-bold text-foreground">{stats?.salesCount ?? 0}</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">All Customers</p>
                <p className="text-2xl font-heading font-bold text-foreground">{stats?.customersCount ?? 0}</p>
              </div>
            </div>
          </div>

          {/* ── Date filter ───────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarRange className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">Filter sales &amp; earnings by date</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
              </div>
              <Button onClick={applyFilter} disabled={loading} className="bg-primary hover:bg-primary/90 text-white font-bold">
                Apply
              </Button>
              {isFiltered && (
                <Button variant="ghost" onClick={clearFilter} disabled={loading} className="gap-1.5 text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* ── Earnings ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                <p className="text-sm font-bold text-foreground">
                  Total Earnings{isFiltered ? " (filtered)" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Currency</span>
                <Select value={earningsCurrency} onValueChange={setEarningsCurrency}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-4xl font-heading font-bold text-foreground">
              {ratesReady && stats
                ? formatInCurrency(stats.totalEarningsKobo, earningsCurrency, rates)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Converted from NGN at the current exchange rate. Switch the currency above to view earnings in another currency.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
