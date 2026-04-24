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

interface KVNamespace {
  get(key: string, type: "json"): Promise<unknown | null>;
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  DATA_GOV_API_KEY: string;
  MANDIMIND_CACHE?: KVNamespace;
  ANALYTICS_KV?: KVNamespace;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const KV_CACHE_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days
const trendCache = new Map<string, { data: unknown; ts: number }>();
const ALLOWED_ANALYTICS_ORIGINS = new Set([
  "https://mandimind.tech",
  "https://www.mandimind.tech",
  "http://localhost:5173",
]);
const ALLOWED_EVENT_NAMES = new Set([
  "home_search_submitted",
  "compare_searched",
  "recommendation_generated",
  "trade_profit_calculated",
  "language_changed",
  "feedback_form_opened",
  "feedback_form_submitted",
  "api_error_seen",
]);

const CROP_MAP: Record<string, string> = {
  onion:   "Onion",
  tomato:  "Tomato",
  wheat:   "Wheat",
  soybean: "Soybean",
  cotton:  "Cotton(Unginned)",
banana: "Banana",
potato: "Potato",
gram: "Gram",
maize: "Maize",
};

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

interface WorkerCacheEnvelope<T> {
  ts: number;
  data: T;
}

interface AnalyticsEventPayload {
  event: string;
  page?: string;
  sessionId?: string;
  ts?: number;
  metadata?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArrivalDate(d: string): number {
  const parts = d?.split("/");
  if (!parts || parts.length !== 3) return 0;
  const [dd, mm, yyyy] = parts;
  return new Date(`${yyyy}-${mm}-${dd}`).getTime();
}

function isDataStale(dateStr: string): boolean {
  if (!dateStr) return true;
  const ts = parseArrivalDate(dateStr);
  if (!ts) return true;
  return ts < Date.now() - 2 * 24 * 60 * 60 * 1000;
}

function normalizeCommodity(value: string): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMarketAlias(value: string): string {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(a\.?p\.?m\.?c\.?|apmc|market|yard)\b/g, " ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMarketMatch(records: PriceRecord[], requestedMarket: string) {
  const requestedNormalized = normalizeCommodity(requestedMarket);
  const requestedAlias = normalizeMarketAlias(requestedMarket);
  const uniqueMarkets = [...new Set(records.map((r) => r.market).filter(Boolean))];

  const withMeta = uniqueMarkets.map((market) => ({
    market,
    normalized: normalizeCommodity(market),
    aliasNormalized: normalizeMarketAlias(market),
  }));

  const byDeterministicOrder = (a: { market: string }, b: { market: string }) =>
    a.market.localeCompare(b.market, "en", { sensitivity: "base" });

  const exact = withMeta
    .filter((entry) => entry.normalized === requestedNormalized)
    .sort(byDeterministicOrder)[0];
  if (exact) return { matchedMarket: exact.market, matchType: "normalized-equality" as const };

  const contains = withMeta
    .filter((entry) => {
      if (!requestedNormalized || !entry.normalized) return false;
      return entry.normalized.includes(requestedNormalized) || requestedNormalized.includes(entry.normalized);
    })
    .sort((a, b) => {
      const aDelta = Math.abs(a.normalized.length - requestedNormalized.length);
      const bDelta = Math.abs(b.normalized.length - requestedNormalized.length);
      if (aDelta !== bDelta) return aDelta - bDelta;
      return byDeterministicOrder(a, b);
    })[0];
  if (contains) return { matchedMarket: contains.market, matchType: "contains-match" as const };

  const aliasMatch = withMeta
    .filter((entry) => {
      if (!requestedAlias || !entry.aliasNormalized) return false;
      return (
        entry.aliasNormalized === requestedAlias ||
        entry.aliasNormalized.includes(requestedAlias) ||
        requestedAlias.includes(entry.aliasNormalized)
      );
    })
    .sort((a, b) => {
      const aDelta = Math.abs(a.aliasNormalized.length - requestedAlias.length);
      const bDelta = Math.abs(b.aliasNormalized.length - requestedAlias.length);
      if (aDelta !== bDelta) return aDelta - bDelta;
      return byDeterministicOrder(a, b);
    })[0];
  if (aliasMatch) return { matchedMarket: aliasMatch.market, matchType: "alias-apmc-match" as const };

  return { matchedMarket: null, matchType: "none" as const };
}

function normalizeCacheSegment(value: string): string {
  const normalized = normalizeCommodity(value);
  return normalized || "all";
}

function buildCacheKey(
  prefix: "prices" | "compare",
  crop: string,
  state: string,
  market?: string,
  extra?: string,
): string {
  const parts = [
    "mandimind",
    "v1",
    prefix,
    normalizeCacheSegment(crop),
    normalizeCacheSegment(state),
  ];

  if (market !== undefined) parts.push(normalizeCacheSegment(market));
  if (extra) parts.push(extra);

  return parts.join(":");
}

function getFreshnessDays(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ts = parseArrivalDate(dateStr);
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

async function kvGet<T>(env: Env, key: string): Promise<WorkerCacheEnvelope<T> | null> {
  if (!env.MANDIMIND_CACHE) return null;
  const raw = await env.MANDIMIND_CACHE.get(key, "json");
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<WorkerCacheEnvelope<T>>;
  if (!parsed.ts || !("data" in parsed)) return null;
  return parsed as WorkerCacheEnvelope<T>;
}

async function kvPut<T>(env: Env, key: string, data: T, expirationTtl = KV_CACHE_TTL_SECONDS): Promise<void | null> {
  if (!env.MANDIMIND_CACHE) return null;
  const payload: WorkerCacheEnvelope<T> = {
    ts: Date.now(),
    data,
  };
  await env.MANDIMIND_CACHE.put(key, JSON.stringify(payload), { expirationTtl });
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

function corsHeaders(origin?: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ANALYTICS_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonWithCors(body: unknown, status = 200, origin?: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function validateEventPayload(body: unknown): AnalyticsEventPayload | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Partial<AnalyticsEventPayload>;
  if (!payload.event || typeof payload.event !== "string") return null;
  if (!ALLOWED_EVENT_NAMES.has(payload.event)) return null;
  if (payload.ts !== undefined && (!Number.isFinite(payload.ts) || payload.ts <= 0)) return null;
  if (payload.page !== undefined && typeof payload.page !== "string") return null;
  if (payload.sessionId !== undefined && typeof payload.sessionId !== "string") return null;
  if (
    payload.metadata !== undefined &&
    (typeof payload.metadata !== "object" || Array.isArray(payload.metadata) || payload.metadata === null)
  ) {
    return null;
  }
  return payload as AnalyticsEventPayload;
}

async function incrementCounter(kv: KVNamespace, date: string, eventName: string): Promise<void> {
  const key = `analytics:daily:${date}:${eventName}`;
  const raw = await kv.get(key);
  const current = Number(raw ?? "0");
  const next = Number.isFinite(current) ? current + 1 : 1;
  await kv.put(key, String(next), { expirationTtl: 60 * 60 * 24 * 45 });
}

function parseNumericPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const normalized = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return normalized;
}

function extractModalPrice(raw: Record<string, unknown>): number | null {
  const candidates = [
    raw.modal_price,
    raw.modalPrice,
    raw.modal_price_rs,
    raw["modal_price/quintal"],
    raw["Modal Price"],
  ];
  for (const candidate of candidates) {
    const parsed = parseNumericPrice(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
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
    "filters[commodity]": commodity,
  });
  if (market) params.set("filters[market]", market);
  if (state)  params.set("filters[state]", state);
  if (arrivalDate) params.set("filters[arrival_date]", arrivalDate);

  const url = `${DATA_GOV_BASE}/${RESOURCE_ID}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);

  const body = await res.json() as { records?: any[] };

  return (body.records || [])
    .map((r: any) => {
      const market = String(r.market ?? r.mandi ?? "").trim();
      const modalPrice = extractModalPrice(r);
      if (!market || !r.arrival_date || modalPrice === null) return null;
      const minPrice = parseNumericPrice(r.min_price) ?? modalPrice;
      const maxPrice = parseNumericPrice(r.max_price) ?? modalPrice;
      return {
        date: r.arrival_date,
        market,
        district: r.district ?? "",
        commodity: r.commodity,
        price: modalPrice,
        min_price: minPrice,
        max_price: maxPrice,
        modal_price: modalPrice,
      } satisfies PriceRecord;
    })
    .filter((r): r is PriceRecord => r !== null)
    .sort((a: PriceRecord, b: PriceRecord) => parseArrivalDate(a.date) - parseArrivalDate(b.date));
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handlePrices(params: URLSearchParams, env: Env): Promise<Response> {
  const crop   = params.get("crop") ?? "";
  const market = params.get("market") ?? "";
  const state  = params.get("state") ?? "Maharashtra";
  const days   = Number(params.get("days") ?? "30");

  if (!crop || !market) {
    return json({ error: "crop and market are required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey  = buildCacheKey("prices", commodity, state, market, `days:${days}`);
  const cached    = await kvGet<any>(env, cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({ ...(cached.data as object), cacheHit: true, source: "kv-fresh", stale: false });
  }

  try {
  let cropMatchedRecords = await fetchDataGov(
    env.DATA_GOV_API_KEY,
    commodity,
    market,
    state,
    Math.max(days, 200)
  );
  let selectedMarketRecords = cropMatchedRecords;
  let matchedMarket = market;
  let marketMatchType: "normalized-equality" | "contains-match" | "alias-apmc-match" | "none" = "normalized-equality";

  if (!cropMatchedRecords.length && market) {
    const broader = await fetchDataGov(
      env.DATA_GOV_API_KEY,
      commodity,
      "",
      state,
      1000
    );
    cropMatchedRecords = broader;
    const picked = pickBestMarketMatch(cropMatchedRecords, market);
    matchedMarket = picked.matchedMarket ?? market;
    marketMatchType = picked.matchType;
    selectedMarketRecords = picked.matchedMarket
      ? cropMatchedRecords.filter((r) => normalizeCommodity(r.market) === normalizeCommodity(picked.matchedMarket))
      : [];
  } else {
    const picked = pickBestMarketMatch(cropMatchedRecords, market);
    matchedMarket = picked.matchedMarket ?? market;
    marketMatchType = picked.matchType;
    selectedMarketRecords = picked.matchedMarket
      ? cropMatchedRecords.filter((r) => normalizeCommodity(r.market) === normalizeCommodity(picked.matchedMarket))
      : [];
  }

  console.log(
    JSON.stringify({
      route: "/api/prices",
      selectedCrop: crop,
      normalizedSelectedCrop: normalizeCommodity(commodity),
      requestedMarket: market,
      matchedMarket,
      matchedRows: selectedMarketRecords.length,
      matchedMarketCount: selectedMarketRecords.length,
      sampleMarkets: [...new Set(cropMatchedRecords.map((r) => r.market))].slice(0, 10),
      marketMatchType,
    })
  );

  const trimmed = selectedMarketRecords.slice(-days);
  const prices = trimmed.map((r) => r.modal_price);
  const latest = trimmed[trimmed.length - 1] ?? null;

  const data = {
    data: trimmed,
    currentPrice: latest?.modal_price ?? null,
    priceRange: {
      low: prices.length ? Math.min(...prices) : null,
      high: prices.length ? Math.max(...prices) : null,
    },
    lastUpdated: latest?.date ?? null,
    stale: latest ? isDataStale(latest.date) : true,
    freshnessDays: getFreshnessDays(latest?.date ?? null),
    requestedMarket: market,
    matchedMarket: selectedMarketRecords.length ? matchedMarket : null,
    matchedMarketCount: selectedMarketRecords.length,
    recordCount: selectedMarketRecords.length,
    usableCount: trimmed.length,
    cacheHit: false,
    source: env.MANDIMIND_CACHE ? "live" : "live-no-kv",
  };

  await kvPut(env, cacheKey, data);
  return json(data);
} catch {
  if (cached) {
    const cachedData = cached.data as any;
    return json({
      ...cachedData,
      source: "kv-stale-fallback",
      cacheHit: true,
      stale: true,
      freshnessDays: getFreshnessDays(cachedData?.lastUpdated ?? null),
      recordCount: cachedData?.recordCount ?? 0,
      usableCount: cachedData?.usableCount ?? 0,
    });
  }
  return json({ error: "data.gov.in unavailable", data: [], source: "error", cacheHit: false }, 502);
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
  const cacheKey  = `trend:${commodity}:${market}:${state}`;
  const cached    = trendCache.get(cacheKey);

  let records: PriceRecord[] = cached ? (cached.data as any).data ?? [] : [];

  if (!records.length) {
    try {
      records = await fetchDataGov(env.DATA_GOV_API_KEY, commodity, market, state, 30);
      const pricesArr = records.map(r => r.modal_price);
      const latest    = records[records.length - 1] ?? null;
      trendCache.set(cacheKey, {
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
  const crop  = params.get("crop") ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days  = Number(params.get("days") ?? "7");
  const mode  = params.get("mode") ?? "recent"; // "today" | "recent"

  if (!crop) {
    return json({ error: "crop is required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey  = buildCacheKey("compare", commodity, state, "", `mode:${mode}:days:${days}`);
const cached    = await kvGet<any>(env, cacheKey);

const today = new Date();
const formatDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
};
const todayKey = formatDate(today);

if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
  const cachedData = cached.data as any;
  const cachedLastUpdated = cachedData?.lastUpdated ?? null;
  const canUseCachedTodayMode =
    mode !== "today" ||
    (cachedData?.status === "today_has_data" && cachedLastUpdated === todayKey);

  if (canUseCachedTodayMode) {
    return json({
      ...cachedData,
      source: "kv-fresh",
      cacheHit: true,
      freshnessDays: getFreshnessDays(cachedLastUpdated),
    });
  }
}

  try {
    const today = new Date();

    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      return `${dd}/${mm}/${yyyy}`;
    };

    const todayKey = formatDate(today);

    const recentDateKeys = Array.from({ length: 3 }, (_, i) => {
  const d = new Date(today);
  d.setDate(today.getDate() - i); // today, 1 day ago, 2 days ago
  return formatDate(d);
});

    const todayRows = await fetchDataGov(
      env.DATA_GOV_API_KEY,
      commodity,
      "",
      state,
      1000,
      todayKey
    );

    const recentBatches = await Promise.all(
      recentDateKeys.map((dateKey) =>
        fetchDataGov(env.DATA_GOV_API_KEY, commodity, "", state, 1000, dateKey)
      )
    );

    const recentRows = recentBatches.flat();

    let status:
      | "today_has_data"
      | "today_no_data_recent_exists"
      | "today_no_data_no_recent"
      | "recent_has_data"
      | "recent_no_data";

    let candidateRecords: PriceRecord[] = [];
    let latestDate: string | null = null;
    let mappedTodayRows: Array<{
      mandi: string;
      todayPrice: number;
      avgPrice: number;
      lastUpdated: string | null;
      stale: false;
    }> = [];

    if (mode === "today") {
      mappedTodayRows = todayRows
        .map((record) => {
          const rawRecord = record as unknown as Record<string, unknown>;
          const mandi = String(
            rawRecord.market ??
            rawRecord.Market ??
            rawRecord.mandi ??
            rawRecord.market_name ??
            "",
          ).trim();
          const price =
            rawRecord.modal_price ??
            rawRecord.modalPrice ??
            rawRecord["Modal Price"] ??
            rawRecord.modal ??
            rawRecord.price;
          const dateValue =
            rawRecord.arrival_date ??
            rawRecord.Arrival_Date ??
            rawRecord.date ??
            rawRecord.Date;
          const lastUpdated = dateValue === null || dateValue === undefined
            ? null
            : String(dateValue);
          const n = Number(String(price ?? "").replace(/,/g, "").trim());

          if (!mandi || !Number.isFinite(n) || n <= 0) return null;

          return {
            mandi,
            todayPrice: n,
            avgPrice: n,
            lastUpdated,
            stale: false as const,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      candidateRecords = todayRows;
      latestDate = todayRows
        .map((r) => r.date)
        .sort((a, b) => parseArrivalDate(b) - parseArrivalDate(a))[0] ?? null;
      status = mappedTodayRows.length > 0
        ? "today_has_data"
        : "today_no_data_recent_exists";
    } else {
      if (recentRows.length > 0) {
        status = "recent_has_data";
        candidateRecords = recentRows;
        latestDate = recentRows
          .map((r) => r.date)
          .sort((a, b) => parseArrivalDate(b) - parseArrivalDate(a))[0] ?? null;
      } else {
        status = "recent_no_data";
        candidateRecords = [];
        latestDate = null;
      }
    }

    const mandis = mode === "today"
      ? mappedTodayRows
      : (() => {
        const byMandi = new Map<string, PriceRecord[]>();
        for (const r of candidateRecords) {
          if (!byMandi.has(r.market)) byMandi.set(r.market, []);
          byMandi.get(r.market)!.push(r);
        }
        return Array.from(byMandi.entries())
          .map(([mandi, recs]) => {
            const sorted = [...recs].sort((a, b) => parseArrivalDate(b.date) - parseArrivalDate(a.date));
            const latest = sorted[0];
            const recentSlice = sorted.slice(0, days);
            const avgPrice = recentSlice.length
              ? Math.round(recentSlice.reduce((sum, r) => sum + r.modal_price, 0) / recentSlice.length)
              : 0;

            const latestDate = latest?.date ?? null;
            const isRealToday = latestDate === todayKey;

            return {
              mandi,
              todayPrice: isRealToday ? latest.modal_price : null,
              avgPrice,
              lastUpdated: latestDate,
              stale: latestDate ? isDataStale(latestDate) : true,
            };
          })
          .sort((a, b) => (b.todayPrice ?? 0) - (a.todayPrice ?? 0));
      })();

    const data = {
      crop: commodity,
      state,
      mode,
      status,
      lastUpdated: latestDate,
      mandis,
      todayCount: todayRows.length,
      recentCount: recentRows.length,
      recordCount: candidateRecords.length,
      usableCount: mode === "today" ? mappedTodayRows.length : mandis.length,
      freshnessDays: getFreshnessDays(latestDate),
      cacheHit: false,
      source: env.MANDIMIND_CACHE ? "live" : "live-no-kv",
    };

    await kvPut(env, cacheKey, data);
    return json(data);

  } catch (error) {
    if (cached) {
      const cachedData = cached.data as any;
      return json({
        ...cachedData,
        source: "kv-stale-fallback",
        cacheHit: true,
        stale: true,
        freshnessDays: getFreshnessDays(cachedData?.lastUpdated ?? null),
      });
    }
    return json({
      error: "data.gov.in unavailable",
      mandis: [],
      status: "upstream_error",
      source: "error",
      cacheHit: false,
    }, 502);
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
        commodityMatches(commodity, r.commodity) &&
        r.modal_price !== null &&
        r.modal_price !== undefined
    );
    console.log(
      JSON.stringify({
        route: "/api/recommendation",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeCommodity(commodity),
        sampleCommodityValues: sampleCommodityValues(records),
        matchedRows: usable.length,
      })
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

async function handleEvents(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ANALYTICS_ORIGINS.has(origin)) {
    return jsonWithCors({ error: "Origin not allowed" }, 403, origin);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON body" }, 400, origin);
  }

  const payload = validateEventPayload(parsedBody);
  if (!payload) {
    return jsonWithCors({ error: "Invalid event payload" }, 400, origin);
  }

  const eventId = crypto.randomUUID();
  const ts = typeof payload.ts === "number" && Number.isFinite(payload.ts) ? payload.ts : Date.now();
  const dailyDate = new Date(ts).toISOString().slice(0, 10);
  const cf = request as Request & { cf?: { country?: string } };
  const eventRecord = {
    ...payload,
    origin,
    ipCountry: cf.cf?.country ?? null,
    userAgent: request.headers.get("User-Agent") ?? null,
    receivedAt: Date.now(),
  };

  if (env.ANALYTICS_KV) {
    ctx.waitUntil(
      Promise.all([
        env.ANALYTICS_KV.put(`analytics:${ts}:${eventId}`, JSON.stringify(eventRecord)),
        incrementCounter(env.ANALYTICS_KV, dailyDate, payload.event),
      ]).catch(() => undefined),
    );
  }

  return jsonWithCors({ ok: true }, 200, origin);
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const params = url.searchParams;

    if (path === "/api/events" && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get("Origin")),
      });
    }

    if (path === "/api/events" && request.method === "POST") {
      return handleEvents(request, env, ctx);
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
if (path === "/api/recommendation") return handleRecommendation(params, env);

    return json({ error: "Not found" }, 404);
  },
};
