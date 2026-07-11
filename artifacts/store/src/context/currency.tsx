import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

const API = "/api";
const STORAGE_KEY = "trst_currency";
const REFETCH_MS = 10 * 60 * 1000;

export interface CurrencyMeta {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyMeta[] = [
  { code: "NGN", symbol: "₦",    label: "NGN (₦)" },
  { code: "USD", symbol: "$",    label: "USD ($)" },
  { code: "GBP", symbol: "£",    label: "GBP (£)" },
  { code: "GHS", symbol: "GH₵", label: "GHS (GH₵)" },
  { code: "KES", symbol: "KSh",  label: "KES (KSh)" },
  { code: "ZAR", symbol: "R",    label: "ZAR (R)" },
  { code: "TZS", symbol: "TSh",  label: "TZS (TSh)" },
  { code: "UGX", symbol: "USh",  label: "UGX (USh)" },
  { code: "XAF", symbol: "CFA",  label: "XAF (CFA)" },
  { code: "XOF", symbol: "CFA",  label: "XOF (CFA)" },
  { code: "RWF", symbol: "RF",   label: "RWF (RF)" },
  { code: "ZMW", symbol: "ZMW",  label: "ZMW (ZMW)" },
];

interface CurrencyContextValue {
  currency: CurrencyMeta;
  rates: Record<string, number>;
  loading: boolean;
  setCurrency: (code: string) => void;
  formatPrice: (kobo: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function getSaved(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? "NGN"; }
  catch { return "NGN"; }
}

function findMeta(code: string): CurrencyMeta {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

const NO_DECIMALS = new Set(["NGN", "TZS", "UGX", "XAF", "XOF", "RWF"]);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCode] = useState<string>(getSaved);
  const [rates, setRates] = useState<Record<string, number>>({ NGN: 1 });
  const [loading, setLoading] = useState(true);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`${API}/fx-rates`);
      if (!res.ok) throw new Error("bad response");
      const data = (await res.json()) as { rates: Record<string, number> };
      setRates(data.rates);
    } catch {
      // keep previous rates silently on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, REFETCH_MS);
    return () => clearInterval(interval);
  }, [fetchRates]);

  const setCurrency = useCallback((code: string) => {
    setCurrencyCode(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* noop */ }
  }, []);

  const currency = findMeta(currencyCode);

  const formatPrice = useCallback(
    (kobo: number): string => {
      const ngn = kobo / 100;
      const rate = rates[currencyCode] ?? 1;
      const converted = ngn * rate;
      const decimals = NO_DECIMALS.has(currencyCode) ? 0 : 2;
      const formatted = converted.toLocaleString("en", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `${currency.symbol}${formatted}`;
    },
    [currencyCode, rates, currency.symbol],
  );

  return (
    <CurrencyContext.Provider value={{ currency, rates, loading, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
