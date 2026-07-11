import { Router } from "express";

const router = Router();

const SUPPORTED = ["NGN","USD","GBP","GHS","KES","ZAR","TZS","UGX","XAF","XOF","RWF","ZMW"];
const PAYSTACK_MARKUP = 1.10;

interface FxCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: FxCache | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchRates(): Promise<Record<string, number>> {
  const res = await fetch("https://api.exchangerate-api.com/v4/latest/NGN");
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const json = (await res.json()) as { rates: Record<string, number> };
  const result: Record<string, number> = {};
  for (const code of SUPPORTED) {
    const raw = json.rates[code];
    if (raw === undefined) continue;
    result[code] = code === "NGN" ? 1 : raw * PAYSTACK_MARKUP;
  }
  return result;
}

router.get("/fx-rates", async (req, res) => {
  try {
    const now = Date.now();
    if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
      const rates = await fetchRates();
      cache = { rates, fetchedAt: now };
    }
    res.json({ rates: cache.rates, fetchedAt: cache.fetchedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch FX rates");
    res.status(502).json({ error: "Failed to fetch exchange rates" });
  }
});

export default router;
