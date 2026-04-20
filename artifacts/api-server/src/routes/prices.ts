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

const COMMODITY_DISPLAY_MAP: Record<string, string> = {
  Onion: "Onion / कांदा",
  Tomato: "Tomato / टोमॅटो",
  Wheat: "Wheat / गहू",
  Soybean: "Soybean / सोयाबीन",
  "Cotton(Unginned)": "Cotton / कापूस",
  Potato: "Potato / बटाटा",
  "Green Chilli": "Green Chilli / हिरवी मिरची",
  Grapes: "Grapes / द्राक्षे",
  Pomegranate: "Pomegranate / डाळिंब",
  Mango: "Mango / आंबा",
  Banana: "Banana / केळी",
  Rice: "Rice / तांदूळ",
};

// Simple in-memory cache: key → { data, ts }
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 min
const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_WINDOWS = [3, 5, 7] as const;

interface ParsedArrivalDate {
  ts: number;
  normalizedTs: number;
  isoDay: string;
}

function parseArrivalDate(d: string): ParsedArrivalDate | null {
  if (!d || typeof d !== "string") return null;

  const trimmed = d.trim();
  if (!trimmed) return null;

  const ddMmYyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyyMatch) {
    const day = Number(ddMmYyyyMatch[1]);
    const month = Number(ddMmYyyyMatch[2]);
    const year = Number(ddMmYyyyMatch[3]);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;

    const normalizedTs = Date.UTC(year, month - 1, day);
    const parsed = new Date(normalizedTs);
    if (Number.isNaN(parsed.getTime())) return null;

    return {
      ts: normalizedTs,
      normalizedTs,
      isoDay: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  }

  const parsed = new Date(trimmed);
  const parsedTs = parsed.getTime();
  if (Number.isNaN(parsedTs)) return null;

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();
  const normalizedTs = Date.UTC(year, month, day);
  const normalizedDate = new Date(normalizedTs);

  return {
    ts: parsedTs,
    normalizedTs,
    isoDay: normalizedDate.toISOString().slice(0, 10),
  };
}

function startOfUtcDayTs(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getDayDifference(arrivalDate: string, todayTs = startOfUtcDayTs()): number | null {
  const parsed = parseArrivalDate(arrivalDate);
  if (!parsed) return null;
  return Math.floor((todayTs - parsed.normalizedTs) / DAY_MS);
}

function isDataStale(dateStr: string): boolean {
  if (!dateStr) return true;
  const dayDiff = getDayDifference(dateStr);
  if (dayDiff === null) return true;
  return dayDiff > 2;
}

function selectWithFallback(records: PriceRecord[], todayTs = startOfUtcDayTs()) {
  for (const windowDays of FALLBACK_WINDOWS) {
    const filtered = records.filter((r) => {
      const dayDiff = getDayDifference(r.date, todayTs);
      return dayDiff !== null && dayDiff >= 0 && dayDiff <= windowDays;
    });
    if (filtered.length > 0) {
      const latest = filtered[filtered.length - 1];
      return {
        records: filtered,
        metadata: {
          freshnessDays: latest ? getDayDifference(latest.date, todayTs) : null,
          source: windowDays === 3 ? "live" as const : "fallback" as const,
        },
      };
    }
  }

  const latestTs = records.reduce((max, row) => Math.max(max, parseArrivalDate(row.date)?.normalizedTs ?? 0), 0);
  const latestRecords = records.filter((row) => (parseArrivalDate(row.date)?.normalizedTs ?? 0) === latestTs);
  const latest = latestRecords[latestRecords.length - 1] ?? records[records.length - 1] ?? null;

  return {
    records: latestRecords.length > 0 ? latestRecords : records.slice(-1),
    metadata: {
      freshnessDays: latest ? getDayDifference(latest.date, todayTs) : null,
      source: "fallback" as const,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculateVariancePct(prices: number[]): number {
  if (!prices.length) return 0;
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
  if (!Number.isFinite(mean) || mean <= 0) return 0;
  const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(Math.max(0, variance));
  return Number(((stdDev / mean) * 100).toFixed(2));
}

function getConfidenceFromSignals(params: {
  freshnessDays: number | null;
  source: "live" | "fallback";
  mandiCount: number;
  priceVariance: number;
}) {
  const freshnessScore = params.freshnessDays === null
    ? 20
    : params.freshnessDays <= 0
      ? 30
      : params.freshnessDays <= 1
        ? 25
        : params.freshnessDays <= 3
          ? 18
          : params.freshnessDays <= 7
            ? 12
            : 6;
  const sourceScore = params.source === "live" ? 25 : 15;
  const mandiCountScore = clamp(params.mandiCount * 2.5, 0, 25);
  const varianceScore = params.priceVariance <= 2
    ? 20
    : params.priceVariance <= 4
      ? 16
      : params.priceVariance <= 7
        ? 12
        : params.priceVariance <= 10
          ? 8
          : 4;

  const confidenceScore = Math.round(
    clamp(freshnessScore + sourceScore + mandiCountScore + varianceScore, 0, 100)
  );

  return {
    confidenceScore,
    confidenceInputs: {
      freshnessDays: params.freshnessDays,
      source: params.source,
      mandiCount: params.mandiCount,
      priceVariance: params.priceVariance,
    },
    confidenceBreakdown: {
      freshness: freshnessScore,
      source: sourceScore,
      mandiCount: mandiCountScore,
      variance: varianceScore,
    },
  };
}

function toDisplayCropName(commodity: string): string {
  return COMMODITY_DISPLAY_MAP[commodity] || commodity;
}

function normalizeCommodity(value: string): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function commodityMatches(selectedCrop: string, datasetCommodity: string): boolean {
  const normalizedCrop = normalizeCommodity(selectedCrop);
  const normalizedCommodity = normalizeCommodity(datasetCommodity);
  if (!normalizedCrop || !normalizedCommodity) return false;
  return normalizedCommodity.includes(normalizedCrop);
}

function sampleCommodityValues(records: PriceRecord[], sampleSize = 8): string[] {
  return [...new Set(records.map((r) => (r.commodity ?? "").trim()).filter(Boolean))].slice(0, sampleSize);
}

interface PriceRecord {
  date: string;
  market: string;
  state: string;
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
  offset = 0,
  arrivalDate?: string,
): Promise<PriceRecord[]> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new Error("DATA_GOV_API_KEY not configured");

  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: String(limit),
    offset: String(offset),
  });
  if (commodity) params.set("filters[commodity]", commodity);
  if (market) params.set("filters[market]", market);
  if (state) params.set("filters[state]", state);
  if (arrivalDate) params.set("filters[arrival_date]", arrivalDate);

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
      state:       r.state ?? "",
      commodity:   r.commodity,
      price:       Number(r.modal_price),
      min_price:   Number(r.min_price),
      max_price:   Number(r.max_price),
      modal_price: Number(r.modal_price),
    }))
    .sort((a, b) => {
      const aTs = parseArrivalDate(a.date)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
      const bTs = parseArrivalDate(b.date)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
      return aTs - bTs;
    });

  return records;
}

async function fetchDataGovPaginated(
  commodity: string,
  market: string,
  state: string,
  {
    limit = 500,
    enoughRows = 2000,
    maxOffset = 5000,
    arrivalDate,
  }: {
    limit?: number;
    enoughRows?: number;
    maxOffset?: number;
    arrivalDate?: string;
  } = {},
): Promise<PriceRecord[]> {
  const allRecords: PriceRecord[] = [];

  for (let offset = 0; offset <= maxOffset; offset += limit) {
    const page = await fetchDataGov(commodity, market, state, limit, offset, arrivalDate);
    allRecords.push(...page);

    if (page.length < limit) break;
    if (allRecords.length >= enoughRows) break;
  }

  return allRecords;
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
    const records = await fetchDataGov("", market, state, Math.max(Number(days), 200));
    const cropMatchedRecords = records.filter((r) => commodityMatches(commodity, r.commodity));
    const fallbackSelection = selectWithFallback(cropMatchedRecords);
    const numDays = Number(days) || 30;
    const trimmed = (fallbackSelection.records.length > 0 ? fallbackSelection.records : cropMatchedRecords).slice(-numDays);
    const todayDayTs = startOfUtcDayTs();
    const recentRangeCount = records.filter((r) => {
      const dayDiff = getDayDifference(r.date, todayDayTs);
      return dayDiff !== null && dayDiff >= 1 && dayDiff <= 3;
    }).length;

    logger.info({
      route: "/api/prices",
      selectedCrop: crop,
      normalizedSelectedCrop: normalizeCommodity(commodity),
      sampleCommodityValues: sampleCommodityValues(records),
      matchedRows: cropMatchedRecords.length,
      market,
      state,
      rawArrivalDatesSample: records.slice(0, 20).map((r) => r.date),
      parsedArrivalDatesSample: records.slice(0, 20).map((r) => {
        const parsed = parseArrivalDate(r.date);
        return {
          raw: r.date,
          parsedIsoDay: parsed?.isoDay ?? null,
          dayDifference: getDayDifference(r.date, todayDayTs),
        };
      }),
      recordCounts: {
        totalRecords: records.length,
        requestedDays: numDays,
        trimmedRecords: trimmed.length,
        recentRangeRecords: recentRangeCount,
      },
    }, "Price pipeline debug stats");

    const prices  = trimmed.map(r => r.modal_price);
    const latest  = trimmed[trimmed.length - 1] ?? null;

    const variance7d = calculateVariancePct(trimmed.slice(-7).map((r) => r.modal_price).filter((p) => p > 0));

    const responseData = {
      data:         trimmed,
      currentPrice: latest?.modal_price ?? null,
      priceRange: {
        low:  prices.length ? Math.min(...prices) : null,
        high: prices.length ? Math.max(...prices) : null,
      },
      lastUpdated: latest?.date ?? null,
      stale:       latest ? isDataStale(latest.date) : true,
      freshnessDays: fallbackSelection.metadata.freshnessDays,
      source:      fallbackSelection.metadata.source,
      variance7d,
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
      data:   [{ date: "", market, commodity, price: 0, min_price: 0, max_price: 0, modal_price: 0 }],
      currentPrice: null,
      priceRange: { low: null, high: null },
      lastUpdated: null,
      freshnessDays: null,
      source: "fallback",
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
    const records = await fetchDataGovPaginated("", "", "", {
      limit: 500,
      enoughRows: 2500,
      maxOffset: 5000,
    });
    const cropFilteredRecords = records.filter(
      (r) => commodityMatches(commodity, r.commodity)
    );
    const stateFilteredRecords = cropFilteredRecords.filter(
      (r) => (r.state || "").trim().toLowerCase() === state.trim().toLowerCase()
    );

    logger.info(
      {
        route: "/api/compare",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeCommodity(commodity),
        sampleCommodityValues: sampleCommodityValues(records),
        state,
        totalRowsFetched: records.length,
        rowsAfterCropFilter: cropFilteredRecords.length,
        rowsAfterStateFilter: stateFilteredRecords.length,
      },
      "Agmarknet pagination coverage stats"
    );

    if (!stateFilteredRecords.length) {
      return res.json({
        mandis: [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: null, stale: true }],
        lastUpdated: null,
        freshnessDays: null,
        source: "fallback",
      });
    }

    const numDays = Number(days) || 7;
    const fallbackSelection = selectWithFallback(stateFilteredRecords);
    const candidateRecords = fallbackSelection.records.length > 0 ? fallbackSelection.records : stateFilteredRecords;

    // Group by market
    const byMandi = new Map<string, PriceRecord[]>();
    for (const r of candidateRecords) {
      if (!byMandi.has(r.market)) byMandi.set(r.market, []);
      byMandi.get(r.market)!.push(r);
    }

    // Find the overall latest date to determine "today"
    const allDates = candidateRecords.map(r => r.date);
    const latestDate = allDates.sort((a, b) => {
      const aTs = parseArrivalDate(a)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
      const bTs = parseArrivalDate(b)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
      return bTs - aTs;
    })[0];

    // Build per-mandi summary
    const mandiSummaries = Array.from(byMandi.entries()).map(([mandi, recs]) => {
      // Sort by date asc
      const sorted = [...recs].sort((a, b) => {
        const aTs = parseArrivalDate(a.date)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
        const bTs = parseArrivalDate(b.date)?.normalizedTs ?? Number.MIN_SAFE_INTEGER;
        return aTs - bTs;
      });
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
        variance7d: calculateVariancePct(recent.map((r) => r.modal_price).filter((p) => p > 0)),
        lastUpdated: latest.date,
        stale:       isDataStale(latest.date),
      };
    }).filter(m => m.todayPrice > 0);

    // Sort by today's price descending
    mandiSummaries.sort((a, b) => b.todayPrice - a.todayPrice);

    const priceVariance = mandiSummaries.length > 0
      ? Number((mandiSummaries.reduce((sum, row) => sum + row.variance7d, 0) / mandiSummaries.length).toFixed(2))
      : 0;
    const confidence = getConfidenceFromSignals({
      freshnessDays: fallbackSelection.metadata.freshnessDays,
      source: fallbackSelection.metadata.source,
      mandiCount: mandiSummaries.length,
      priceVariance,
    });

    const responseData = {
      mandis:      mandiSummaries.length > 0
        ? mandiSummaries
        : [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: latestDate ?? null, stale: true }],
      lastUpdated: latestDate,
      freshnessDays: fallbackSelection.metadata.freshnessDays,
      source:      fallbackSelection.metadata.source,
      priceVariance,
      ...confidence,
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
      mandis:  [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: null, stale: true }],
      freshnessDays: null,
      source:  "fallback",
    });
  }
});

// ── GET /api/crops ───────────────────────────────────────────────────────────
// Query: state (default Maharashtra), days (default 15)
// Returns crops seen in recent real data, ranked by recency + frequency.
router.get("/crops", async (req: Request, res: Response) => {
  const { state = "Maharashtra", days = "15" } = req.query as Record<string, string>;
  const windowDays = Math.max(7, Math.min(15, Number(days) || 15));
  const cacheKey = `crops:${state}:${windowDays}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json({ ...(cached.data as object), fromCache: true });
  }

  try {
    const records = await fetchDataGov("", "", state, 500);
    const todayDayTs = startOfUtcDayTs();
    const bucket = new Map<string, { latestTs: number; latestDate: string; recordCount: number }>();

    for (const row of records) {
      const commodity = row.commodity?.trim();
      if (!commodity) continue;
      const parsed = parseArrivalDate(row.date);
      if (!parsed) continue;
      const ageDays = Math.floor((todayDayTs - parsed.normalizedTs) / DAY_MS);
      if (ageDays < 0 || ageDays > windowDays) continue;

      const existing = bucket.get(commodity);
      if (!existing) {
        bucket.set(commodity, { latestTs: parsed.normalizedTs, latestDate: row.date, recordCount: 1 });
      } else {
        existing.recordCount += 1;
        if (parsed.normalizedTs > existing.latestTs) {
          existing.latestTs = parsed.normalizedTs;
          existing.latestDate = row.date;
        }
      }
    }

    const crops = Array.from(bucket.entries())
      .map(([commodity, meta]) => ({
        id: commodity,
        name: toDisplayCropName(commodity),
        commodity,
        latestDate: meta.latestDate,
        recordCount: meta.recordCount,
      }))
      .sort((a, b) => {
        const byDate = (parseArrivalDate(b.latestDate)?.normalizedTs ?? Number.MIN_SAFE_INTEGER)
          - (parseArrivalDate(a.latestDate)?.normalizedTs ?? Number.MIN_SAFE_INTEGER);
        if (byDate !== 0) return byDate;
        const byCount = b.recordCount - a.recordCount;
        if (byCount !== 0) return byCount;
        return a.name.localeCompare(b.name);
      });

    const responseData = { crops, windowDays, source: "live" };
    cache.set(cacheKey, { data: responseData, ts: Date.now() });
    return res.json(responseData);
  } catch (err) {
    logger.error({ err }, "crop universe fetch failed");
    if (cached) {
      return res.json({ ...(cached.data as object), fromCache: true, stale: true });
    }
    return res.status(502).json({
      crops: [],
      windowDays,
      source: "error",
      error: "data.gov.in unavailable",
    });
  }
});

export default router;
