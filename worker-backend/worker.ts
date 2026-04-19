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
  commodity:   string;
  price:       number;
  min_price:   number;
  max_price:   number;
  modal_price: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArrivalDate(d: string): number {
  if (!d || typeof d !== "string") return 0;
  const slashParts = d.split("/");
  if (slashParts.length === 3) {
    const [dd, mm, yyyy] = slashParts;
    return new Date(`${yyyy}-${mm}-${dd}`).getTime();
  }
  const parsed = new Date(d);
  const ts = parsed.getTime();
  return Number.isFinite(ts) ? ts : 0;
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
  arrivalDate?: string,
): Promise<PriceRecord[]> {
  if (!apiKey) throw new Error("DATA_GOV_API_KEY not configured");

  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: String(limit),
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
  commodity:   r.commodity,
  price:       Number(r.modal_price),
  min_price:   Number(r.min_price),
  max_price:   Number(r.max_price),
  modal_price: Number(r.modal_price),
}))
    .sort((a: PriceRecord, b: PriceRecord) => parseArrivalDate(a.date) - parseArrivalDate(b.date));
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
    const records = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, market, state, Math.max(days, 100));
    const trimmed = records.slice(-days);
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
      source:      "live",
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);

  } catch {
    if (cached) return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json({ error: "data.gov.in unavailable", data: [], source: "error" }, 502);
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
    const records = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, "", state, 500);
    if (!records.length) {
      return json({ mandis: [], lastUpdated: null, source: "live" });
    }

    const latestModeWindowDays = 3;
    const todayTs = new Date();
    const recentDateKeys = Array.from({ length: latestModeWindowDays + 1 }, (_, offset) => {
      const date = new Date(todayTs);
      date.setDate(todayTs.getDate() - offset);
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = String(date.getFullYear());
      return `${dd}/${mm}/${yyyy}`;
    });

    const recentDateBatches = await Promise.all(
      recentDateKeys.map((dateKey) => fetchDataGov(env.DATA_GOV_API_KEY, commodity, "", state, 500, dateKey))
    );
    const mergedRecentRecords = recentDateBatches.flat();
    const mergedRecentKeys = new Set(
      mergedRecentRecords.map((r) => `${r.market}|${r.date}|${r.modal_price}`)
    );
    const recentWindowRecords = [
      ...mergedRecentRecords,
      ...records.filter((r) => recentDateKeys.includes(r.date) && !mergedRecentKeys.has(`${r.market}|${r.date}|${r.modal_price}`)),
    ];
    const candidateRecords = recentWindowRecords.length > 0 ? recentWindowRecords : records;

    const byMandi = new Map<string, PriceRecord[]>();
    for (const r of candidateRecords) {
      if (!byMandi.has(r.market)) byMandi.set(r.market, []);
      byMandi.get(r.market)!.push(r);
    }

    const allDates  = candidateRecords.map(r => r.date);
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
      .filter(m => m.todayPrice > 0)
      .sort((a, b) => b.todayPrice - a.todayPrice);

    const data = { mandis: mandiSummaries, lastUpdated: latestDate, source: "live" };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);

  } catch {
    if (cached) return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json({ error: "data.gov.in unavailable", mandis: [], source: "error" }, 502);
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

  try {
    const records = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, "", state, 500);

    const usable = records.filter(
      (r) =>
        r &&
        r.market &&
        r.commodity &&
        r.commodity.trim().toLowerCase() === commodity.trim().toLowerCase() &&
        r.modal_price !== null &&
        r.modal_price !== undefined
    );

    if (!usable.length) {
      return json({
        action: "CHECK",
        confidence: "low",
        reason: "No usable mandi price records found for this crop.",
        summary: "No recommendation available.",
        markets: [],
      });
    }

    const sorted = [...usable].sort((a, b) => b.modal_price - a.modal_price);

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
