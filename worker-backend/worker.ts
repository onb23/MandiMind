/**
 * Cloudflare Worker entry point for MandiMind API.
 *
 * Replicates the same /api/prices, /api/trend, /api/compare logic as the
 * Express server, but uses the native Workers fetch handler API.
 * No Node.js, no Express, no pino — all CF-compatible.
 *
 * Deploy:
 *   wrangler secret put DATA_GOV_API_KEY
 *   wrangler deploy
 */

export interface Env {
  DATA_GOV_API_KEY: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const DAY_MS = 24 * 60 * 60 * 1000;

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

// In-memory cache (lives for the lifetime of the Worker isolate)
const cache = new Map<string, { data: unknown; ts: number }>();

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceRecord {
  date:        string;
  market:      string;
  district:    string;
  state:       string;
  commodity:   string;
  price:       number;
  min_price:   number;
  max_price:   number;
  modal_price: number;
}

interface RecommendationTraceStage {
  count: number;
  sample: Array<{ market: string; date: string; commodity: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArrivalDate(d: string): number {
  if (!d || typeof d !== "string") return 0;
  const trimmed = d.trim();
  if (!trimmed) return 0;
  const slashParts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashParts) {
    const day = Number(slashParts[1]);
    const month = Number(slashParts[2]);
    const year = Number(slashParts[3]);
    return Date.UTC(year, month - 1, day);
  }
  const parsed = new Date(trimmed);
  const ts = parsed.getTime();
  if (!Number.isFinite(ts)) return 0;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function startOfUtcDayTs(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getFreshnessDays(dateStr: string, todayTs = startOfUtcDayTs()): number | null {
  const ts = parseArrivalDate(dateStr);
  if (!ts) return null;
  return Math.max(0, Math.floor((todayTs - ts) / DAY_MS));
}

function selectWithFallback(records: PriceRecord[], todayTs = startOfUtcDayTs()) {
  const windows = [3, 5, 7];
  for (const windowDays of windows) {
    const filtered = records.filter((r) => {
      const freshness = getFreshnessDays(r.date, todayTs);
      return freshness !== null && freshness <= windowDays;
    });
    if (filtered.length > 0) {
      const freshnessDays = getFreshnessDays(
        filtered[filtered.length - 1]?.date ?? filtered[0]?.date ?? "",
        todayTs,
      ) ?? null;
      return {
        records: filtered,
        metadata: { freshnessDays, source: windowDays === 3 ? "live" as const : "fallback" as const },
      };
    }
  }

  const latestTs = records.reduce((max, row) => Math.max(max, parseArrivalDate(row.date)), 0);
  const latestRecords = records.filter((row) => parseArrivalDate(row.date) === latestTs);
  const freshest = latestRecords[latestRecords.length - 1] ?? records[records.length - 1] ?? null;
  return {
    records: latestRecords.length > 0 ? latestRecords : records.slice(-1),
    metadata: {
      freshnessDays: freshest ? getFreshnessDays(freshest.date, todayTs) : null,
      source: "fallback" as const,
    },
  };
}

function isDataStale(dateStr: string): boolean {
  if (!dateStr) return true;
  const ts = parseArrivalDate(dateStr);
  if (!ts) return true;
  return ts < Date.now() - 2 * 24 * 60 * 60 * 1000;
}

function toDisplayCropName(commodity: string): string {
  return COMMODITY_DISPLAY_MAP[commodity] ?? commodity;
}

function formatDateDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getActiveCropFallback() {
  return Object.entries(CROP_MAP).map(([id, commodity]) => ({
    id,
    name: toDisplayCropName(commodity),
    commodity,
    latestDate: null,
    recordCount: 0,
  }));
}

function normalizeMarketName(market: string): string {
  return (market ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function sampleRecords(records: PriceRecord[], sampleSize = 5) {
  return records.slice(0, sampleSize).map((r) => ({
    market: r.market ?? "",
    date: r.date ?? "",
    commodity: r.commodity ?? "",
  }));
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function fetchDataGov(
  apiKey: string,
  commodity: string,
  market: string,
  state: string,
  limit = 100,
  offset = 0,
  arrivalDate?: string,
): Promise<PriceRecord[]> {
  if (!apiKey) throw new Error("DATA_GOV_API_KEY not configured");

  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: String(limit),
    offset: String(offset),
  });
  if (commodity) params.set("filters[commodity]", commodity);
  if (market) params.set("filters[market]", market);
  if (state)  params.set("filters[state]", state);
  if (arrivalDate) params.set("filters[arrival_date]", arrivalDate);

  const url = `${DATA_GOV_BASE}/${RESOURCE_ID}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);

  const body = await res.json() as { records?: any[] };

  return (body.records || [])
    .filter((r: any) => r.modal_price && Number(r.modal_price) >= 50 && r.arrival_date)
    .map((r: any) => ({
  date:        r.arrival_date,
  market:      r.market,
  district:    r.district ?? "",
  state:       r.state ?? "",
  commodity:   r.commodity,
  price:       Number(r.modal_price),
  min_price:   Number(r.min_price),
  max_price:   Number(r.max_price),
  modal_price: Number(r.modal_price),
}))
    .sort((a: PriceRecord, b: PriceRecord) => parseArrivalDate(a.date) - parseArrivalDate(b.date));
}

async function fetchDataGovPaginated(
  apiKey: string,
  commodity: string,
  market: string,
  state: string,
  {
    limit = 500,
    enoughRows = 2500,
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
    const page = await fetchDataGov(apiKey, commodity, market, state, limit, offset, arrivalDate);
    allRecords.push(...page);
    if (page.length < limit) break;
    if (allRecords.length >= enoughRows) break;
  }
  return allRecords;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handlePrices(params: URLSearchParams, env: Env): Promise<Response> {
  const crop   = params.get("crop")   ?? "";
  const market = params.get("market") ?? "";
  const state  = params.get("state")  ?? "Maharashtra";
  const days   = Number(params.get("days") ?? "30");

  if (!crop || !market) {
    return json({ error: "crop and market are required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey  = `prices:${commodity}:${market}:${state}`;
  const cached    = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({ ...(cached.data as object), fromCache: true, stale: false });
  }

  try {
    const records = await fetchDataGov(env.DATA_GOV_API_KEY, "", market, state, Math.max(days, 200));
    const cropMatchedRecords = records.filter((r) => commodityMatches(commodity, r.commodity));

    console.log(
      JSON.stringify({
        route: "/api/prices",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeCommodity(commodity),
        sampleCommodityValues: sampleCommodityValues(records),
        matchedRows: cropMatchedRecords.length,
      })
    );

    const { records: fallbackRecords, metadata } = selectWithFallback(cropMatchedRecords);
    const trimmed = (fallbackRecords.length > 0 ? fallbackRecords : cropMatchedRecords).slice(-days);
    const prices  = trimmed.map(r => r.modal_price);
    const latest  = trimmed[trimmed.length - 1] ?? null;

    const data = {
      data:         trimmed,
      currentPrice: latest?.modal_price ?? null,
      priceRange: {
        low:  prices.length ? Math.min(...prices) : null,
        high: prices.length ? Math.max(...prices) : null,
      },
      lastUpdated: latest?.date ?? null,
      stale:       latest ? isDataStale(latest.date) : true,
      freshnessDays: metadata.freshnessDays,
      source:      metadata.source,
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);

  } catch {
    if (cached) return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json({
      error: "data.gov.in unavailable",
      data: [{ date: "", market, commodity, price: 0, min_price: 0, max_price: 0, modal_price: 0 }],
      currentPrice: null,
      priceRange: { low: null, high: null },
      lastUpdated: null,
      freshnessDays: null,
      source: "fallback",
    }, 502);
  }
}

async function handleTrend(params: URLSearchParams, env: Env): Promise<Response> {
  const crop   = params.get("crop")   ?? "";
  const market = params.get("market") ?? "";
  const state  = params.get("state")  ?? "Maharashtra";

  if (!crop || !market) {
    return json({ error: "crop and market are required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey  = `prices:${commodity}:${market}:${state}`;
  const cached    = cache.get(cacheKey);

  let records: PriceRecord[] = cached ? (cached.data as any).data ?? [] : [];

  if (!records.length) {
    try {
      records = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, market, state, 30);
      const pricesArr = records.map(r => r.modal_price);
      const latest    = records[records.length - 1] ?? null;
      cache.set(cacheKey, {
        ts: Date.now(),
        data: {
          data: records,
          currentPrice: latest?.modal_price ?? null,
          priceRange: {
            low:  pricesArr.length ? Math.min(...pricesArr) : null,
            high: pricesArr.length ? Math.max(...pricesArr) : null,
          },
          lastUpdated: latest?.date ?? null,
          stale: latest ? isDataStale(latest.date) : true,
          source: "live",
        },
      });
    } catch { /* fall through with empty records */ }
  }

  const prices = records.map(r => r.modal_price || r.price).filter(p => p > 0);

  function ma(n: number): number | null {
    if (prices.length < n) return null;
    const slice = prices.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  const ma5val       = ma(5);
  const ma10val      = ma(10);
  const currentPrice = prices[prices.length - 1] ?? null;
  const prevPrice    = prices[prices.length - 2] ?? currentPrice;
  const latest       = records[records.length - 1] ?? null;

  let trend: "rising" | "falling" | "stable" = "stable";
  if (ma5val !== null && ma10val !== null) {
    if (ma5val > ma10val * 1.001)      trend = "rising";
    else if (ma5val < ma10val * 0.999) trend = "falling";
  } else if (currentPrice !== null && prevPrice !== null) {
    if (currentPrice > prevPrice * 1.001)      trend = "rising";
    else if (currentPrice < prevPrice * 0.999) trend = "falling";
  }

  const diff      = currentPrice != null && prevPrice != null ? currentPrice - prevPrice : null;
  const priceDiff = diff != null ? `${diff >= 0 ? "+" : ""}₹${Math.round(diff)}` : null;

  return json({
    trend,
    ma5:         ma5val  !== null ? ma5val.toFixed(0)  : null,
    ma10:        ma10val !== null ? ma10val.toFixed(0) : null,
    currentPrice,
    priceDiff,
    lastUpdated: latest?.date ?? null,
    stale:       latest ? isDataStale(latest.date) : true,
    recordCount: records.length,
  });
}

async function handleCompare(params: URLSearchParams, env: Env): Promise<Response> {
  const crop  = params.get("crop")  ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days  = Number(params.get("days") ?? "7");

  if (!crop) {
    return json({ error: "crop is required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey  = `compare:${commodity}:${state}`;
  const cached    = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({ ...(cached.data as object), fromCache: true });
  }

  try {
    const records = await fetchDataGovPaginated(env.DATA_GOV_API_KEY, "", "", "", {
      limit: 500,
      enoughRows: 2500,
      maxOffset: 5000,
    });
    const cropFilteredRecords = records.filter(
      (r) => commodityMatches(commodity, r.commodity)
    );
    const normalizedState = state.trim().toLowerCase();
    const stateFilteredRecords = cropFilteredRecords.filter((r) => {
      const rowState = (r.state || "").trim().toLowerCase();
      if (!rowState || !normalizedState) return false;
      return rowState.includes(normalizedState) || normalizedState.includes(rowState);
    });
    const usedStateFallback = stateFilteredRecords.length === 0;
    const finalRows = usedStateFallback ? cropFilteredRecords : stateFilteredRecords;

    console.log(
      JSON.stringify({
        route: "/api/compare",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeCommodity(commodity),
        sampleCommodityValues: sampleCommodityValues(records),
        state,
        totalRowsFetched: records.length,
        rowsAfterCropFilter: cropFilteredRecords.length,
        rowsAfterStateFilter: stateFilteredRecords.length,
        usedStateFallback,
      })
    );

    if (!cropFilteredRecords.length) {
      return json({
        mandis: [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: null, stale: true }],
        lastUpdated: null,
        freshnessDays: null,
        source: "fallback",
      });
    }

    const selected = selectWithFallback(finalRows);
    const candidateRecords = selected.records.length > 0 ? selected.records : finalRows;
    const usableRows = candidateRecords.filter(
      (r) => Boolean(r.market && r.commodity && r.date)
    );
    const finalCandidateRows = usableRows.length > 0 ? usableRows : candidateRecords;

    const byMandi = new Map<string, PriceRecord[]>();
    for (const r of finalCandidateRows) {
      if (!byMandi.has(r.market)) byMandi.set(r.market, []);
      byMandi.get(r.market)!.push(r);
    }

    const allDates  = finalCandidateRows.map(r => r.date);
    const latestDate = allDates.sort((a, b) => parseArrivalDate(b) - parseArrivalDate(a))[0];

    const mandiSummaries = Array.from(byMandi.entries())
      .map(([mandi, recs]) => {
        const sorted   = [...recs].sort((a, b) => parseArrivalDate(a.date) - parseArrivalDate(b.date));
        const latest   = sorted[sorted.length - 1];
        const recent   = sorted.slice(-days);
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
      })
      .sort((a, b) => b.todayPrice - a.todayPrice);

    const data = {
      mandis: mandiSummaries.length > 0
        ? mandiSummaries
        : [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: latestDate ?? null, stale: true }],
      lastUpdated: latestDate,
      freshnessDays: selected.metadata.freshnessDays,
      source: selected.metadata.source,
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);

  } catch {
    if (cached) return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json({
      error: "data.gov.in unavailable",
      mandis: [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, lastUpdated: null, stale: true }],
      freshnessDays: null,
      source: "fallback",
    }, 502);
  }
}

async function handleCrops(params: URLSearchParams, env: Env): Promise<Response> {
  const state = params.get("state") ?? "Maharashtra";
  const requestedDays = Number(params.get("days") ?? "15");
  const windowDays = Math.max(7, Math.min(15, requestedDays || 15));
  const cacheKey = `crops:${state}:${windowDays}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({ ...(cached.data as object), fromCache: true });
  }

  try {
    const today = new Date();
    const bucket = new Map<string, { latestTs: number; latestDate: string; recordCount: number }>();

    for (let dayOffset = 0; dayOffset <= windowDays; dayOffset += 1) {
      const probeDate = new Date(today);
      probeDate.setDate(today.getDate() - dayOffset);
      const arrivalDate = formatDateDdMmYyyy(probeDate);
      const rows = await fetchDataGov(env.DATA_GOV_API_KEY, "", "", state, 200, arrivalDate);

      for (const row of rows) {
        const commodity = row.commodity?.trim();
        if (!commodity) continue;
        const ts = parseArrivalDate(row.date);
        if (!ts) continue;

        const ageDays = Math.floor((today.getTime() - ts) / (24 * 60 * 60 * 1000));
        if (ageDays < 0 || ageDays > windowDays) continue;

        const existing = bucket.get(commodity);
        if (!existing) {
          bucket.set(commodity, { latestTs: ts, latestDate: row.date, recordCount: 1 });
        } else {
          existing.recordCount += 1;
          if (ts > existing.latestTs) {
            existing.latestTs = ts;
            existing.latestDate = row.date;
          }
        }
      }
    }

    const liveCrops = Array.from(bucket.entries())
      .map(([commodity, meta]) => ({
        id: commodity,
        name: toDisplayCropName(commodity),
        commodity,
        latestDate: meta.latestDate,
        recordCount: meta.recordCount,
      }))
      .sort((a, b) => {
        const byDate = parseArrivalDate(b.latestDate) - parseArrivalDate(a.latestDate);
        if (byDate !== 0) return byDate;
        const byCount = b.recordCount - a.recordCount;
        if (byCount !== 0) return byCount;
        return a.name.localeCompare(b.name);
      });

    const crops = liveCrops.length > 0 ? liveCrops : getActiveCropFallback();
    const source = liveCrops.length > 0 ? "live" : "fallback_active";

    const data = { crops, windowDays, source };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);
  } catch {
    if (cached) return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json(
      {
        crops: getActiveCropFallback(),
        windowDays,
        source: "fallback_active",
        stale: true,
        error: "data.gov.in unavailable",
      },
      200
    );
  }
}

async function handleRecommendation(params: URLSearchParams, env: Env): Promise<Response> {
  const crop  = params.get("crop") ?? "";
  const state = params.get("state") ?? "Maharashtra";

  if (!crop) {
    return json({ error: "crop is required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const tracingCrop = "Onion";
  const traceEnabled = commodity.trim().toLowerCase() === tracingCrop.toLowerCase();

  try {
    const upstreamLimit = 500;
    const upstreamRecords = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, "", state, upstreamLimit);
    const afterDateParsing = upstreamRecords.filter((r) => parseArrivalDate(r.date) > 0);
    const afterCropFiltering = afterDateParsing.filter((r) => commodityMatches(commodity, r.commodity));
    const afterMandiNormalization = afterCropFiltering.filter((r) => normalizeMarketName(r.market).length > 0);
    const usable = afterMandiNormalization.filter(
      (r) =>
        r &&
        r.market &&
        r.commodity &&
        r.modal_price !== null &&
        r.modal_price !== undefined &&
        Number.isFinite(r.modal_price) &&
        r.modal_price > 0
    );
    const finalRecords = [...usable].sort((a, b) => b.modal_price - a.modal_price);

    const cropUniverseWindowDays = 15;
    const cropUniverseRecords = await fetchDataGov(env.DATA_GOV_API_KEY, "", "", state, upstreamLimit);
    const cropUniverseTodayTs = startOfUtcDayTs();
    const cropUniverseRecent = cropUniverseRecords.filter((row) => {
      const freshnessDays = getFreshnessDays(row.date, cropUniverseTodayTs);
      return freshnessDays !== null && freshnessDays >= 0 && freshnessDays <= cropUniverseWindowDays;
    });
    const cropInRecentUniverse = cropUniverseRecent.some((row) => commodityMatches(commodity, row.commodity));
    const cropInFetchedDataset = upstreamRecords.some((row) => commodityMatches(commodity, row.commodity));

    const pipelineTrace = {
      crop: commodity,
      normalizedSelectedCrop: normalizeCommodity(commodity),
      state,
      fetchScope: {
        resultLimitPerRequest: upstreamLimit,
        pagination: "No offset used; first page only",
        mandiLimit: "No explicit mandi cap; constrained by first-page row limit",
        dateWindowLimit: "No fetch-time date filter in recommendation endpoint",
      },
      cropPresence: {
        cropInRecentUniverse,
        cropInFetchedDataset,
        cropUniverseWindowDays,
        sampleCommodityValues: sampleCommodityValues(upstreamRecords),
        matchedRowsAfterCropFilter: afterCropFiltering.length,
      },
      stages: {
        rawUpstreamFetched: { count: upstreamRecords.length, sample: sampleRecords(upstreamRecords) } satisfies RecommendationTraceStage,
        afterDateParsing: { count: afterDateParsing.length, sample: sampleRecords(afterDateParsing) } satisfies RecommendationTraceStage,
        afterCropFiltering: { count: afterCropFiltering.length, sample: sampleRecords(afterCropFiltering) } satisfies RecommendationTraceStage,
        afterMandiNormalization: { count: afterMandiNormalization.length, sample: sampleRecords(afterMandiNormalization) } satisfies RecommendationTraceStage,
        afterUsabilityFiltering: { count: usable.length, sample: sampleRecords(usable) } satisfies RecommendationTraceStage,
        finalRecordsReturned: { count: finalRecords.length, sample: sampleRecords(finalRecords) } satisfies RecommendationTraceStage,
      },
    };

    if (traceEnabled) {
      console.log("[recommendation-trace]", JSON.stringify(pipelineTrace));
    }

    if (!usable.length) {
      return json({
        action: "CHECK",
        confidence: "low",
        reason: "No usable mandi price records found for this crop.",
        summary: "No recommendation available.",
        markets: [],
        debugTrace: traceEnabled ? pipelineTrace : undefined,
      });
    }

    const sorted = finalRecords;

    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const average = Math.round(
      sorted.reduce((sum, r) => sum + r.modal_price, 0) / sorted.length
    );

    const current = usable[0];
    const gapFromBest = best.modal_price - current.modal_price;

    let action = "CHECK OTHER MANDI";
    let confidence = "medium";
    let reason = "Better mandi prices are available in the current results.";

    if (current.market === best.market || gapFromBest <= average * 0.05) {
      action = "SELL";
      confidence = "high";
      reason = "Your current mandi is at or near the best available modal price.";
    } else if (gapFromBest > average * 0.20) {
      action = "CHECK OTHER MANDI";
      confidence = "high";
      reason = `A significantly better mandi is available: ${best.market} at ₹${best.modal_price}/quintal.`;
    }

    return json({
      crop: commodity,
      state,
      action,
      confidence,
      reason,
      currentMarket: current.market,
      currentDistrict: current.district,
      currentModalPrice: current.modal_price,
      bestMarket: best.market,
      bestDistrict: best.district,
      bestModalPrice: best.modal_price,
      worstMarket: worst.market,
      worstDistrict: worst.district,
      worstModalPrice: worst.modal_price,
      averageModalPrice: average,
      summary: `${action}: ${reason}`,
      marketsChecked: sorted.length,
      lastUpdated: best.date,
      stale: isDataStale(best.date),
      debugTrace: traceEnabled ? pipelineTrace : undefined,
    });
  } catch {
    return json({
      error: "data.gov.in unavailable",
      action: "CHECK",
      confidence: "low",
      reason: "Could not fetch mandi data right now.",
      summary: "Recommendation unavailable.",
    }, 502);
  }
}

async function handleHealth(): Promise<Response> {
  return json({
    status: "ok",
    runtime: "cloudflare-worker",
    version: "worker-ts-v2",
    ts: Date.now()
  });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const params = url.searchParams;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (path === "/api/health")         return handleHealth();
if (path === "/api/prices")         return handlePrices(params, env);
if (path === "/api/trend")          return handleTrend(params, env);
if (path === "/api/compare")        return handleCompare(params, env);
if (path === "/api/crops")          return handleCrops(params, env);
if (path === "/api/recommendation") return handleRecommendation(params, env);

    return json({ error: "Not found" }, 404);
  },
};
