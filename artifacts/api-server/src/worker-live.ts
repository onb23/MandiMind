interface KVNamespace {
  get(key: string, type: "json"): Promise<unknown | null>;
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  DATA_GOV_API_KEY?: string;
  MANDIMIND_CACHE?: KVNamespace;
}

const DATA_GOV_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const AGMARKNET_REPORT_URL = "https://api.agmarknet.gov.in/v1/daily-price-arrival/report";
const CACHE_TTL_SECONDS = 60 * 30;

const CROP_MAP: Record<string, string> = {
  onion: "Onion",
  tomato: "Tomato",
  potato: "Potato",
  banana: "Banana",
  cotton: "Cotton",
  wheat: "Wheat",
  maize: "Maize",
  bajra: "Bajra(Pearl Millet/Cumbu)",
  green_chilli: "Green Chilli",
  chilli: "Green Chilli",
  brinjal: "Brinjal",
  cauliflower: "Cauliflower",
  cabbage: "Cabbage",
  tur: "Arhar(Tur/Red Gram)(Whole)",
  arhar: "Arhar(Tur/Red Gram)(Whole)",
  orange: "Orange",
  grapes: "Grapes",
  mango: "Mango",
  pomegranate: "Pomegranate",
  soybean: "Soybean",
  gram: "Gram",
};

const AGMARKNET_CROP_META: Record<string, { group: string; commodity: string }> = {
  onion: { group: "6", commodity: "23" },
  tomato: { group: "6", commodity: "65" },
  potato: { group: "6", commodity: "24" },
  banana: { group: "5", commodity: "19" },
  cotton: { group: "4", commodity: "15" },
  wheat: { group: "1", commodity: "1" },
  maize: { group: "1", commodity: "4" },
  bajra: { group: "1", commodity: "28" },
  greenchilli: { group: "6", commodity: "73" },
  chilli: { group: "6", commodity: "73" },
  brinjal: { group: "6", commodity: "32" },
  cauliflower: { group: "6", commodity: "31" },
  cabbage: { group: "6", commodity: "126" },
  tur: { group: "2", commodity: "45" },
  arhar: { group: "2", commodity: "45" },
  orange: { group: "5", commodity: "18" },
  grapes: { group: "5", commodity: "22" },
  mango: { group: "5", commodity: "20" },
  pomegranate: { group: "5", commodity: "160" },
};

interface PriceRecord {
  date: string;
  market: string;
  district: string;
  commodity: string;
  price: number;
  min_price: number;
  max_price: number;
  modal_price: number;
  arrival_qty?: number | null;
  source?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function normalize(value: string): string {
  return (value ?? "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toYyyyMmDd(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${yyyy}-${mm}-${dd}`;
}

function convertAgmarknetDate(dateStr: string): string {
  const m = String(dateStr ?? "").match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return dateStr;
  return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
}

function parseDateMs(dateStr: string | null): number {
  if (!dateStr) return 0;
  const slash = String(dateStr).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1])).getTime();
  const dash = String(dateStr).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return new Date(Number(dash[3]), Number(dash[2]) - 1, Number(dash[1])).getTime();
  const parsed = new Date(dateStr).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getFreshnessDays(dateStr: string | null): number | null {
  const ms = parseDateMs(dateStr);
  if (!ms) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)));
}

function cacheKey(prefix: string, crop: string, state: string, market = "", extra = ""): string {
  return ["mandimind", "live-v2", prefix, normalize(crop), normalize(state), normalize(market), extra]
    .filter(Boolean)
    .join(":");
}

async function kvGet<T>(env: Env, key: string): Promise<T | null> {
  if (!env.MANDIMIND_CACHE) return null;
  const raw = await env.MANDIMIND_CACHE.get(key, "json");
  if (!raw || typeof raw !== "object") return null;
  const envelope = raw as { ts?: number; data?: T };
  if (!envelope.ts || Date.now() - envelope.ts > CACHE_TTL_SECONDS * 1000) return null;
  return envelope.data ?? null;
}

async function kvPut<T>(env: Env, key: string, data: T): Promise<void> {
  if (!env.MANDIMIND_CACHE) return;
  await env.MANDIMIND_CACHE.put(key, JSON.stringify({ ts: Date.now(), data }), { expirationTtl: CACHE_TTL_SECONDS });
}

async function fetchAgmarknetDirect(cropId: string, days = 3): Promise<PriceRecord[]> {
  const cropKey = normalize(cropId);
  const meta = AGMARKNET_CROP_META[cropKey];
  if (!meta) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Math.max(days, 3));

  const payload = {
    from_date: toYyyyMmDd(from),
    to_date: toYyyyMmDd(to),
    data_type: "100006",
    group: meta.group,
    commodity: meta.commodity,
    state: "[20]",
    district: "[100001]",
    market: "[100002]",
    grade: "[100003]",
    variety: "[100007]",
    page: "1",
    limit: "500",
  };

  const res = await fetch(AGMARKNET_REPORT_URL, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) throw new Error(`Agmarknet HTTP ${res.status}`);
  const body = await res.json() as any;
  const records = body?.data?.records?.[0]?.data;
  if (!Array.isArray(records)) return [];

  return records
    .map((r: any) => {
      const market = String(r.market_name ?? "").trim();
      const date = convertAgmarknetDate(String(r.arrival_date ?? ""));
      const modal = parseNumber(r.model_price);
      if (!market || !date || modal === null) return null;
      return {
        date,
        market,
        district: String(r.district_name ?? ""),
        commodity: String(r.cmdt_name ?? cropId),
        price: modal,
        min_price: parseNumber(r.min_price) ?? modal,
        max_price: parseNumber(r.max_price) ?? modal,
        modal_price: modal,
        arrival_qty: parseNumber(r.arrival_qty),
        source: "agmarknet-direct",
      } satisfies PriceRecord;
    })
    .filter((r: PriceRecord | null): r is PriceRecord => r !== null)
    .sort((a: PriceRecord, b: PriceRecord) => parseDateMs(a.date) - parseDateMs(b.date));
}

async function fetchDataGov(apiKey: string | undefined, cropId: string, market: string, state: string, limit = 100): Promise<PriceRecord[]> {
  if (!apiKey) return [];
  const commodity = CROP_MAP[normalize(cropId)] ?? cropId;
  const params = new URLSearchParams({
    "api-key": apiKey,
    format: "json",
    limit: String(limit),
    "filters[commodity]": commodity,
  });
  if (state) params.set("filters[state]", state);
  if (market) params.set("filters[market]", market);

  const res = await fetch(`${DATA_GOV_BASE}/${DATA_GOV_RESOURCE_ID}?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const body = await res.json() as any;
  const records = Array.isArray(body?.records) ? body.records : [];

  return records
    .map((r: any) => {
      const mandi = String(r.market ?? r.mandi ?? "").trim();
      const modal = parseNumber(r.modal_price ?? r.modalPrice ?? r["Modal Price"]);
      if (!mandi || !r.arrival_date || modal === null) return null;
      return {
        date: String(r.arrival_date),
        market: mandi,
        district: String(r.district ?? ""),
        commodity: String(r.commodity ?? commodity),
        price: modal,
        min_price: parseNumber(r.min_price) ?? modal,
        max_price: parseNumber(r.max_price) ?? modal,
        modal_price: modal,
        source: "data-gov",
      } satisfies PriceRecord;
    })
    .filter((r: PriceRecord | null): r is PriceRecord => r !== null)
    .sort((a: PriceRecord, b: PriceRecord) => parseDateMs(a.date) - parseDateMs(b.date));
}

function groupLatestByMandi(records: PriceRecord[], days: number, todayKey: string) {
  const byMandi = new Map<string, PriceRecord[]>();
  for (const r of records) {
    if (!byMandi.has(r.market)) byMandi.set(r.market, []);
    byMandi.get(r.market)!.push(r);
  }

  return Array.from(byMandi.entries())
    .map(([mandi, recs]) => {
      const sorted = [...recs].sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date));
      const latest = sorted[0];
      const slice = sorted.slice(0, Math.max(1, days));
      const avgPrice = Math.round(slice.reduce((sum, r) => sum + r.modal_price, 0) / slice.length);
      const isToday = latest.date === todayKey;
      return {
        mandi,
        todayPrice: isToday ? latest.modal_price : null,
        avgPrice,
        minPrice: latest.min_price,
        maxPrice: latest.max_price,
        arrivalQty: latest.arrival_qty ?? null,
        lastUpdated: latest.date,
        stale: (getFreshnessDays(latest.date) ?? 99) > 1,
        freshnessDays: getFreshnessDays(latest.date),
        source: latest.source ?? "unknown",
      };
    })
    .sort((a, b) => {
      const byDate = parseDateMs(b.lastUpdated) - parseDateMs(a.lastUpdated);
      if (byDate !== 0) return byDate;
      return (b.todayPrice ?? b.avgPrice ?? 0) - (a.todayPrice ?? a.avgPrice ?? 0);
    });
}

async function handleCompare(params: URLSearchParams, env: Env): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days = Number(params.get("days") ?? "5");
  const mode = params.get("mode") ?? "recent";
  if (!crop) return json({ error: "crop is required" }, 400);

  const key = cacheKey("compare", crop, state, "", `days:${days}:mode:${mode}`);
  const cached = await kvGet<any>(env, key);
  if (cached) return json({ ...cached, cacheHit: true, source: `${cached.source || "cache"}-kv` });

  let records: PriceRecord[] = [];
  let source = "agmarknet-direct";

  try {
    records = await fetchAgmarknetDirect(crop, days);
  } catch (error) {
    console.error("Agmarknet direct failed", error);
  }

  if (!records.length) {
    source = "data-gov";
    records = await fetchDataGov(env.DATA_GOV_API_KEY, crop, "", state, 1000);
  }

  const latestDate = records.map((r) => r.date).sort((a, b) => parseDateMs(b) - parseDateMs(a))[0] ?? null;
  const todayKey = toDdMmYyyy(new Date());
  const mandis = groupLatestByMandi(records, days, todayKey);
  const todayCount = records.filter((r) => r.date === todayKey).length;

  const data = {
    crop: CROP_MAP[normalize(crop)] ?? crop,
    state,
    mode,
    status: mandis.length ? (todayCount ? "today_has_data" : "recent_has_data") : "recent_no_data",
    lastUpdated: latestDate,
    mandis,
    todayCount,
    recentCount: records.length,
    recordCount: records.length,
    usableCount: mandis.length,
    freshnessDays: getFreshnessDays(latestDate),
    cacheHit: false,
    source,
  };

  await kvPut(env, key, data);
  return json(data);
}

async function handlePrices(params: URLSearchParams, env: Env): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const market = params.get("market") ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days = Number(params.get("days") ?? "30");
  if (!crop || !market) return json({ error: "crop and market are required" }, 400);

  const key = cacheKey("prices", crop, state, market, `days:${days}`);
  const cached = await kvGet<any>(env, key);
  if (cached) return json({ ...cached, cacheHit: true, source: `${cached.source || "cache"}-kv` });

  let records: PriceRecord[] = [];
  let source = "agmarknet-direct";
  try {
    const all = await fetchAgmarknetDirect(crop, Math.max(days, 5));
    const wanted = normalize(market);
    records = all.filter((r) => normalize(r.market) === wanted || normalize(r.market).includes(wanted) || wanted.includes(normalize(r.market)));
  } catch (error) {
    console.error("Agmarknet direct prices failed", error);
  }

  if (!records.length) {
    source = "data-gov";
    records = await fetchDataGov(env.DATA_GOV_API_KEY, crop, market, state, Math.max(days, 200));
  }

  const trimmed = records.slice(-days);
  const prices = trimmed.map((r) => r.modal_price);
  const latest = trimmed[trimmed.length - 1] ?? null;
  const data = {
    data: trimmed,
    currentPrice: latest?.modal_price ?? null,
    priceRange: { low: prices.length ? Math.min(...prices) : null, high: prices.length ? Math.max(...prices) : null },
    lastUpdated: latest?.date ?? null,
    stale: latest ? (getFreshnessDays(latest.date) ?? 99) > 1 : true,
    freshnessDays: getFreshnessDays(latest?.date ?? null),
    requestedMarket: market,
    matchedMarket: latest?.market ?? null,
    matchedMarketCount: records.length,
    recordCount: records.length,
    usableCount: trimmed.length,
    cacheHit: false,
    source,
  };

  await kvPut(env, key, data);
  return json(data);
}

async function handleTrend(params: URLSearchParams, env: Env): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const market = params.get("market") ?? "";
  const prices = await handlePrices(params, env);
  const body = await prices.clone().json() as any;
  const rows = Array.isArray(body?.data) ? body.data : [];
  const values = rows.map((r: any) => r.modal_price ?? r.price).filter((p: unknown) => Number.isFinite(p));
  const currentPrice = values[values.length - 1] ?? null;
  const prevPrice = values[values.length - 2] ?? currentPrice;
  let trend: "rising" | "falling" | "stable" = "stable";
  if (currentPrice !== null && prevPrice !== null) {
    if (currentPrice > prevPrice * 1.001) trend = "rising";
    else if (currentPrice < prevPrice * 0.999) trend = "falling";
  }
  const diff = currentPrice !== null && prevPrice !== null ? currentPrice - prevPrice : null;
  return json({ trend, currentPrice, priceDiff: diff !== null ? `${diff >= 0 ? "+" : ""}₹${Math.round(diff)}` : null, lastUpdated: body.lastUpdated ?? null, stale: body.stale ?? true, recordCount: rows.length, source: body.source ?? "unknown", crop, market });
}

async function handleCrops(params: URLSearchParams): Promise<Response> {
  return json({
    state: params.get("state") ?? "Maharashtra",
    source: "static-active-crops",
    crops: Object.entries(CROP_MAP).map(([id, name]) => ({ id, name, commodity: name, recordCount: 0, latestDate: null })),
  });
}

async function handleRecommendation(params: URLSearchParams, env: Env): Promise<Response> {
  const compareRes = await handleCompare(params, env);
  const body = await compareRes.clone().json() as any;
  const mandis = Array.isArray(body?.mandis) ? body.mandis : [];
  const best = mandis[0];
  return json({
    action: best ? "CHECK OTHER MANDI" : "CHECK",
    confidence: best ? "medium" : "low",
    reason: best ? `Best latest available mandi is ${best.mandi}.` : "No usable mandi price records found.",
    summary: best ? `Latest available price: ₹${best.avgPrice}/quintal at ${best.mandi}.` : "No recommendation available.",
    markets: mandis.slice(0, 5),
    source: body.source ?? "unknown",
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") {
        return json({ ok: true, service: "mandimind-api", engine: "agmarknet-direct-primary", cropCount: Object.keys(CROP_MAP).length });
      }
      if (url.pathname === "/api/compare") return handleCompare(url.searchParams, env);
      if (url.pathname === "/api/prices") return handlePrices(url.searchParams, env);
      if (url.pathname === "/api/trend") return handleTrend(url.searchParams, env);
      if (url.pathname === "/api/crops") return handleCrops(url.searchParams);
      if (url.pathname === "/api/recommendation") return handleRecommendation(url.searchParams, env);
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker error", error);
      return json({ error: "Internal error", source: "error" }, 500);
    }
  },
};
