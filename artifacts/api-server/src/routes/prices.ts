import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";

// MVP crop mapping: our internal ID → data.gov.in commodity name
const CROP_MAP: Record<string, string> = {
  onion:   "Onion",
  tomato:  "Tomato",
  wheat:   "Wheat",
  soybean: "Soybean",
  cotton:  "Cotton(Unginned)",
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

function isDataStale(dateStr: string): boolean {
  if (!dateStr) return true;
  const ts = parseArrivalDate(dateStr);
  if (!ts) return true;
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  return ts < twoDaysAgo;
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
  });
  if (market) params.set("filters[market]", market);
  if (state) params.set("filters[state]", state);

  const url = `${DATA_GOV_BASE}/${RESOURCE_ID}?${params.toString()}`;
  logger.info({ url: url.replace(apiKey, "***") }, "Fetching data.gov.in");

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);
  const json = await res.json() as { records?: any[] };

  const records: PriceRecord[] = (json.records || [])
    .filter((r: any) => r.modal_price && Number(r.modal_price) >= 50 && r.arrival_date)
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

// ── GET /api/prices ─────────────────────────────────────────────────────────
// Query: crop, market, state (default Maharashtra), days (default 30)
// Returns: { data[], currentPrice, priceRange, lastUpdated, source, stale }
router.get("/prices", async (req: Request, res: Response) => {
  const { crop, market, state = "Maharashtra", days = "30" } = req.query as Record<string, string>;

  if (!crop || !market) {
    return res.status(400).json({ error: "crop and market are required" });
  }

  const commodity = CROP_MAP[crop.toLowerCase()] || crop;
  const cacheKey  = `prices:${commodity}:${market}:${state}`;
  const cached    = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ ...(cached.data as object), fromCache: true, stale: false });
  }

  try {
    const records = await fetchDataGov(commodity, market, state, Math.max(Number(days), 100));

    const numDays = Number(days) || 30;
    const trimmed = records.slice(-numDays);
    const prices  = trimmed.map(r => r.modal_price);
    const latest  = trimmed[trimmed.length - 1] ?? null;

    const responseData = {
      data:         trimmed,
      currentPrice: latest?.modal_price ?? null,
      priceRange: {
        low:  prices.length ? Math.min(...prices) : null,
        high: prices.length ? Math.max(...prices) : null,
      },
      lastUpdated: latest?.date ?? null,
      stale:       latest ? isDataStale(latest.date) : true,
      source:      "live",
    };

    cache.set(cacheKey, { data: responseData, ts: Date.now() });
    return res.json(responseData);

  } catch (err) {
    logger.error({ err }, "data.gov.in fetch failed");
    if (cached) {
      return res.json({ ...(cached.data as object), fromCache: true, stale: true });
    }
    return res.status(502).json({
      error:  "data.gov.in unavailable",
      data:   [],
      source: "error",
    });
  }
});

// ── GET /api/trend ───────────────────────────────────────────────────────────
// Returns: { trend, ma5, ma10, currentPrice, priceDiff, lastUpdated, stale, recordCount }
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
      const prices = records.map(r => r.modal_price);
      const latest = records[records.length - 1] ?? null;
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
          stale:       latest ? isDataStale(latest.date) : true,
          source: "live",
        },
      });
    } catch (err) {
      logger.error({ err }, "Trend fetch failed");
    }
  }

  const prices = records.map(r => r.modal_price || r.price).filter(p => p > 0);

  function ma(n: number): number | null {
    if (prices.length < n) return null;
    const slice = prices.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  const ma5val  = ma(5);
  const ma10val = ma(10);
  const currentPrice = prices[prices.length - 1] ?? null;
  const prevPrice    = prices[prices.length - 2] ?? currentPrice;
  const latest       = records[records.length - 1] ?? null;

  // Trend: based on MA5 vs MA10 when available; otherwise day-over-day change
  let trend: "rising" | "falling" | "stable" = "stable";
  if (ma5val !== null && ma10val !== null) {
    if (ma5val > ma10val * 1.001) trend = "rising";
    else if (ma5val < ma10val * 0.999) trend = "falling";
  } else if (currentPrice !== null && prevPrice !== null) {
    if (currentPrice > prevPrice * 1.001) trend = "rising";
    else if (currentPrice < prevPrice * 0.999) trend = "falling";
  }

  const diff = currentPrice != null && prevPrice != null ? currentPrice - prevPrice : null;
  const priceDiff = diff != null ? `${diff >= 0 ? "+" : ""}₹${Math.round(diff)}` : null;

  return res.json({
    trend,
    ma5:         ma5val !== null ? ma5val.toFixed(0) : null,
    ma10:        ma10val !== null ? ma10val.toFixed(0) : null,
    currentPrice,
    priceDiff,
    lastUpdated: latest?.date ?? null,
    stale:       latest ? isDataStale(latest.date) : true,
    recordCount: records.length,
  });
});

// ── GET /api/compare ─────────────────────────────────────────────────────────
// Query: crop, state (default Maharashtra), days (default 7)
// Fetches all mandis in the state for the crop; returns sorted by today's price.
// Returns: { mandis: [{mandi, todayPrice, avgPrice, lastUpdated, stale}], lastUpdated, source }
router.get("/compare", async (req: Request, res: Response) => {
  const { crop, state = "Maharashtra", days = "7" } = req.query as Record<string, string>;

  if (!crop) {
    return res.status(400).json({ error: "crop is required" });
  }

  const commodity = CROP_MAP[crop.toLowerCase()] || crop;
  const cacheKey  = `compare:${commodity}:${state}`;
  const cached    = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ ...(cached.data as object), fromCache: true });
  }

  try {
    // Fetch all records for crop+state (no market filter) — up to 500
    const records = await fetchDataGov(commodity, "", state, 500);

    if (!records.length) {
      return res.json({ mandis: [], lastUpdated: null, source: "live" });
    }

    const numDays = Number(days) || 7;

    // Group by market
    const byMandi = new Map<string, PriceRecord[]>();
    for (const r of records) {
      if (!byMandi.has(r.market)) byMandi.set(r.market, []);
      byMandi.get(r.market)!.push(r);
    }

    // Find the overall latest date to determine "today"
    const allDates = records.map(r => r.date);
    const latestDate = allDates.sort((a, b) => parseArrivalDate(b) - parseArrivalDate(a))[0];

    // Build per-mandi summary
    const mandiSummaries = Array.from(byMandi.entries()).map(([mandi, recs]) => {
      // Sort by date asc
      const sorted = [...recs].sort((a, b) => parseArrivalDate(a.date) - parseArrivalDate(b.date));
      const latest = sorted[sorted.length - 1];
      // 7-day avg: last N records
      const recent = sorted.slice(-numDays);
      const avgPrice = recent.length
        ? Math.round(recent.reduce((s, r) => s + r.modal_price, 0) / recent.length)
        : 0;

      return {
        mandi,
        todayPrice:  latest.modal_price,
        avgPrice,
        lastUpdated: latest.date,
        stale:       isDataStale(latest.date),
      };
    }).filter(m => m.todayPrice > 0);

    // Sort by today's price descending
    mandiSummaries.sort((a, b) => b.todayPrice - a.todayPrice);

    const responseData = {
      mandis:      mandiSummaries,
      lastUpdated: latestDate,
      source:      "live",
    };

    cache.set(cacheKey, { data: responseData, ts: Date.now() });
    return res.json(responseData);

  } catch (err) {
    logger.error({ err }, "compare fetch failed");
    if (cached) {
      return res.json({ ...(cached.data as object), fromCache: true, stale: true });
    }
    return res.status(502).json({
      error:   "data.gov.in unavailable",
      mandis:  [],
      source:  "error",
    });
  }
});

export default router;
