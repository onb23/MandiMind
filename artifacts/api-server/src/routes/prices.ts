import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";

// Crop name mapping: our internal ID → data.gov.in commodity name
const CROP_MAP: Record<string, string> = {
  onion:     "Onion",
  tomato:    "Tomato",
  wheat:     "Wheat",
  soybean:   "Soybean",
  cotton:    "Cotton(Unginned)",
  rice:      "Rice",
  maize:     "Maize",
  sugarcane: "Sugarcane",
  chilli:    "Chilli",
  garlic:    "Garlic",
};

// Simple in-memory cache: key → { data, ts }
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min

function parseArrivalDate(d: string): number {
  // "DD/MM/YYYY" → timestamp
  const parts = d?.split("/");
  if (!parts || parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts;
  return new Date(`${yyyy}-${mm}-${dd}`).getTime();
}

interface PriceRecord {
  date: string;
  market: string;
  commodity: string;
  price: number;
  min_price: number;
  max_price: number;
  modal_price: number;
}

async function fetchDataGov(
  commodity: string,
  market: string,
  state: string,
  limit = 100,
): Promise<PriceRecord[]> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new Error("DATA_GOV_API_KEY not configured");

  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: String(limit),
    "filters[commodity]": commodity,
    "filters[market]": market,
  });
  if (state) params.set("filters[state]", state);

  const url = `${DATA_GOV_BASE}/${RESOURCE_ID}?${params.toString()}`;
  logger.info({ url: url.replace(apiKey, "***") }, "Fetching data.gov.in");

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);
  const json = await res.json() as { records?: any[] };

  const records: PriceRecord[] = (json.records || [])
    .filter((r: any) => r.modal_price && r.arrival_date)
    .map((r: any) => ({
      date:        r.arrival_date,
      market:      r.market,
      commodity:   r.commodity,
      price:       Number(r.modal_price),
      min_price:   Number(r.min_price),
      max_price:   Number(r.max_price),
      modal_price: Number(r.modal_price),
    }))
    .sort((a, b) => parseArrivalDate(a.date) - parseArrivalDate(b.date));

  return records;
}

// ── GET /api/prices ────────────────────────────────────────────────────────────
// Query: crop, market, state, days (default 30)
// Returns: { data[], currentPrice, priceRange, lastUpdated, source }
router.get("/prices", async (req: Request, res: Response) => {
  const { crop, market, state = "Maharashtra", days = "30" } = req.query as Record<string, string>;

  if (!crop || !market) {
    return res.status(400).json({ error: "crop and market are required" });
  }

  const commodity = CROP_MAP[crop.toLowerCase()] || crop;
  const cacheKey  = `prices:${commodity}:${market}:${state}`;
  const cached    = cache.get(cacheKey);

  // Serve stale cache immediately for speed, then refresh
  const serveFromCache = (stale = false) => {
    if (cached) {
      return res.json({ ...(cached.data as object), fromCache: true, stale });
    }
    return null;
  };

  // If fresh cache, return immediately
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return serveFromCache();
  }

  try {
    const records = await fetchDataGov(commodity, market, state, Math.max(Number(days), 100));

    // Trim to requested days (most recent)
    const numDays  = Number(days) || 30;
    const trimmed  = records.slice(-numDays);
    const prices   = trimmed.map(r => r.modal_price);
    const latest   = trimmed[trimmed.length - 1] ?? null;

    const responseData = {
      data:         trimmed,
      currentPrice: latest?.modal_price ?? null,
      priceRange: {
        low:  prices.length ? Math.min(...prices) : null,
        high: prices.length ? Math.max(...prices) : null,
      },
      lastUpdated: latest?.date ?? null,
      source:      "live",
    };

    cache.set(cacheKey, { data: responseData, ts: Date.now() });
    return res.json(responseData);

  } catch (err) {
    logger.error({ err }, "data.gov.in fetch failed");

    // Fall back to stale cache
    if (cached) {
      return serveFromCache(true);
    }

    return res.status(502).json({
      error:   "data.gov.in unavailable",
      data:    [],
      source:  "error",
    });
  }
});

// ── GET /api/trend ─────────────────────────────────────────────────────────────
// Returns: { trend, ma5, ma10, currentPrice, priceDiff, lastUpdated }
router.get("/trend", async (req: Request, res: Response) => {
  const { crop, market, state = "Maharashtra" } = req.query as Record<string, string>;

  if (!crop || !market) {
    return res.status(400).json({ error: "crop and market are required" });
  }

  const commodity = CROP_MAP[crop.toLowerCase()] || crop;
  const cacheKey  = `prices:${commodity}:${market}:${state}`;
  const cached    = cache.get(cacheKey);

  let records: PriceRecord[] = cached
    ? (cached.data as any).data || []
    : [];

  if (!records.length) {
    try {
      records = await fetchDataGov(commodity, market, state, 30);
      // Prime the price cache too
      const prices   = records.map(r => r.modal_price);
      const latest   = records[records.length - 1] ?? null;
      cache.set(cacheKey, {
        ts: Date.now(),
        data: {
          data: records,
          currentPrice: latest?.modal_price ?? null,
          priceRange: {
            low:  prices.length ? Math.min(...prices) : null,
            high: prices.length ? Math.max(...prices) : null,
          },
          lastUpdated: latest?.date ?? null,
          source: "live",
        },
      });
    } catch (err) {
      logger.error({ err }, "Trend fetch failed");
    }
  }

  const prices = records.map(r => r.modal_price || r.price);

  function ma(n: number): number {
    if (!prices.length) return 0;
    const slice = prices.slice(-Math.min(n, prices.length));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  const ma5  = ma(5);
  const ma10 = ma(10);
  const currentPrice = prices[prices.length - 1] ?? null;
  const oldPrice     = prices[0] ?? currentPrice;

  const trend =
    ma5 > ma10 * 1.001 ? "rising" :
    ma5 < ma10 * 0.999 ? "falling" : "stable";

  const diff = currentPrice != null && oldPrice != null
    ? currentPrice - oldPrice
    : null;
  const priceDiff = diff != null
    ? `${diff >= 0 ? "+" : ""}₹${Math.round(diff)}`
    : null;

  const lastUpdated = records[records.length - 1]?.date ?? null;

  return res.json({
    trend,
    ma5:          ma5.toFixed(0),
    ma10:         ma10.toFixed(0),
    currentPrice,
    priceDiff,
    lastUpdated,
    recordCount:  records.length,
  });
});

export default router;
