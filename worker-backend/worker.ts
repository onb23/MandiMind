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
  RECENT_MANDI_KV?: KVNamespace;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const DATA_GOV_BASE = "https://api.data.gov.in/resource";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const DAY_MS = 24 * 60 * 60 * 1000;

const CROP_MAP: Record<string, string> = {
  onion: "Onion",
  tomato: "Tomato",
  wheat: "Wheat",
  soybean: "Soybean",
  cotton: "Cotton(Unginned)",
  banana: "Banana",
  rice: "Rice",
  potato: "Potato",
  mango: "Mango",
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
  date: string;
  market: string;
  district: string;
  state: string;
  commodity: string;
  variety?: string;
  price: number;
  min_price: number;
  max_price: number;
  modal_price: number;
}

interface RecentMandiSnapshot {
  mandi: string;
  date: string;
  modal_price: number;
  min_price: number;
  max_price: number;
  variety?: string;
  timestamp: number;
}

interface CompareMandiDateEntry {
  date: string;
  freshnessDays: number | null;
  price: number;
  minPrice: number;
  maxPrice: number;
  variety?: string;
}

interface RecommendationTraceStage {
  count: number;
  sample: Array<{ market: string; date: string; commodity: string }>;
}

interface CacheDebugFields {
  kvAvailable: boolean;
  cacheKey: string;
  cacheReadAttempted: boolean;
  cacheHit: boolean;
  cacheWriteAttempted: boolean;
  cacheWriteSucceeded: boolean;
  source: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArrivalDate(d: string): number {
  if (!d || typeof d !== "string") return 0;
  const trimmed = d.trim();
  if (!trimmed) return 0;

  // dd/mm/yyyy
  const slashParts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashParts) {
    const day = Number(slashParts[1]);
    const month = Number(slashParts[2]);
    const year = Number(slashParts[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  // ISO-like strings (yyyy-mm-dd and datetime variants)
  const isoParts = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s].*)/);
  if (isoParts) {
    const year = Number(isoParts[1]);
    const month = Number(isoParts[2]);
    const day = Number(isoParts[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  const ts = Date.parse(trimmed);
  if (!Number.isFinite(ts)) return 0;
  const parsed = new Date(ts);
  return Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
}

function startOfUtcDayTs(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getFreshnessDays(
  dateStr: string,
  todayTs = startOfUtcDayTs(),
): number | null {
  const ts = parseArrivalDate(dateStr);
  if (!ts) return null;
  const diffMs = todayTs - ts;
  if (diffMs < 0) return null;
  return Math.floor(diffMs / DAY_MS);
}

function selectWithFallback(
  records: PriceRecord[],
  todayTs = startOfUtcDayTs(),
) {
  const windows = [3, 5, 7];
  for (const windowDays of windows) {
    const filtered = records.filter((r) => {
      const freshness = getFreshnessDays(r.date, todayTs);
      return freshness !== null && freshness <= windowDays;
    });
    if (filtered.length > 0) {
      const freshnessDays =
        getFreshnessDays(
          filtered[filtered.length - 1]?.date ?? filtered[0]?.date ?? "",
          todayTs,
        ) ?? null;
      return {
        records: filtered,
        metadata: {
          freshnessDays,
          source: windowDays === 3 ? ("live" as const) : ("fallback" as const),
        },
      };
    }
  }

  const latestTs = records.reduce(
    (max, row) => Math.max(max, parseArrivalDate(row.date)),
    0,
  );
  const latestRecords = records.filter(
    (row) => parseArrivalDate(row.date) === latestTs,
  );
  const freshest =
    latestRecords[latestRecords.length - 1] ??
    records[records.length - 1] ??
    null;
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
  return (market ?? "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function buildRecentKvKey(
  crop: string,
  state: string,
  dateKey: string,
): string {
  return `mandimind:v1:compare:${(state ?? "").trim().toLowerCase()}:${(crop ?? "").trim().toLowerCase()}:${dateKey}`;
}

function toUtcDateKeyFromTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function getRecentDateWindow(
  todayTs = startOfUtcDayTs(),
  windowDays = 3,
): Array<{ dateKey: string; displayDate: string }> {
  const out: Array<{ dateKey: string; displayDate: string }> = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const ts = todayTs - offset * DAY_MS;
    const d = new Date(ts);
    out.push({
      dateKey: toUtcDateKeyFromTs(ts),
      displayDate: formatDateDdMmYyyy(d),
    });
  }
  return out;
}

function toRecentSnapshot(
  records: PriceRecord[],
  todayTs = startOfUtcDayTs(),
): RecentMandiSnapshot[] {
  const dedupe = new Map<string, RecentMandiSnapshot>();
  for (const row of records) {
    const freshnessDays = getFreshnessDays(row.date, todayTs);
    if (freshnessDays === null || freshnessDays < 0 || freshnessDays > 3)
      continue;
    if (!row.market || !row.date || !Number.isFinite(row.modal_price)) continue;
    const key = `${normalizeMarketName(row.market)}|${row.date}`;
    const snapshot: RecentMandiSnapshot = {
      mandi: row.market,
      date: row.date,
      modal_price: row.modal_price,
      min_price: Number.isFinite(row.min_price)
        ? row.min_price
        : row.modal_price,
      max_price: Number.isFinite(row.max_price)
        ? row.max_price
        : row.modal_price,
      variety: row.variety,
      timestamp: Date.now(),
    };
    const existing = dedupe.get(key);
    if (!existing || snapshot.modal_price > existing.modal_price) {
      dedupe.set(key, snapshot);
    }
  }
  return [...dedupe.values()].sort((a, b) => {
    const byDate = parseArrivalDate(b.date) - parseArrivalDate(a.date);
    if (byDate !== 0) return byDate;
    return b.modal_price - a.modal_price;
  });
}

function dedupeRecentSnapshots(
  entries: RecentMandiSnapshot[],
): RecentMandiSnapshot[] {
  const byMandiDate = new Map<string, RecentMandiSnapshot>();
  for (const entry of entries) {
    if (!entry?.mandi || !entry?.date) continue;
    const key = `${normalizeMarketName(entry.mandi)}|${entry.date}`;
    const existing = byMandiDate.get(key);
    if (!existing) {
      byMandiDate.set(key, entry);
      continue;
    }
    const existingTs = Number(existing.timestamp) || 0;
    const incomingTs = Number(entry.timestamp) || 0;
    if (incomingTs >= existingTs && entry.modal_price >= existing.modal_price) {
      byMandiDate.set(key, entry);
    }
  }
  return [...byMandiDate.values()];
}

async function writeRecentDataToKv(
  env: Env,
  crop: string,
  state: string,
  records: PriceRecord[],
  todayTs = startOfUtcDayTs(),
): Promise<{ attempted: boolean; succeeded: boolean }> {
  if (!env.RECENT_MANDI_KV) return { attempted: false, succeeded: false };
  const recentSnapshots = dedupeRecentSnapshots(
    toRecentSnapshot(records, todayTs),
  );
  if (recentSnapshots.length === 0)
    return { attempted: false, succeeded: false };
  const byDate = new Map<string, RecentMandiSnapshot[]>();
  for (const entry of recentSnapshots) {
    const ts = parseArrivalDate(entry.date);
    if (!ts) continue;
    const dateKey = toUtcDateKeyFromTs(ts);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(entry);
  }
  let attempted = false;
  let succeeded = false;
  for (const [dateKey, entries] of byDate.entries()) {
    try {
      const key = buildRecentKvKey(crop, state, dateKey);
      attempted = true;
      await env.RECENT_MANDI_KV.put(
        key,
        JSON.stringify({
          updatedAt: new Date().toISOString(),
          dateKey,
          entries: dedupeRecentSnapshots(entries),
        }),
        { expirationTtl: 259200 },
      );
      succeeded = true;
    } catch {
      // KV-safe no-op
    }
  }
  return { attempted, succeeded };
}

async function readRecentDataFromKv(
  env: Env,
  crop: string,
  state: string,
  todayTs = startOfUtcDayTs(),
): Promise<PriceRecord[]> {
  if (!env.RECENT_MANDI_KV) return [];
  const window = getRecentDateWindow(todayTs, 3);
  const allRows: PriceRecord[] = [];
  for (const item of window) {
    try {
      const key = buildRecentKvKey(crop, state, item.dateKey);
      const raw = await env.RECENT_MANDI_KV.get(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { entries?: RecentMandiSnapshot[] };
      const entries = dedupeRecentSnapshots(
        Array.isArray(parsed?.entries) ? parsed.entries : [],
      );
      for (const entry of entries) {
        const freshnessDays = getFreshnessDays(entry.date, todayTs);
        if (freshnessDays === null || freshnessDays < 0 || freshnessDays > 3)
          continue;
        allRows.push({
          date: entry.date,
          market: entry.mandi,
          district: "",
          state,
          commodity: crop,
          variety: entry.variety,
          price: entry.modal_price,
          min_price: entry.min_price,
          max_price: entry.max_price,
          modal_price: entry.modal_price,
        });
      }
    } catch {
      // KV-safe no-op
    }
  }
  return allRows.sort(
    (a, b) =>
      parseArrivalDate(b.date) - parseArrivalDate(a.date) ||
      b.modal_price - a.modal_price,
  );
}

function dedupePriceRowsByMandiDate(records: PriceRecord[]): PriceRecord[] {
  const map = new Map<string, PriceRecord>();
  for (const row of records) {
    if (!row?.market || !row?.date) continue;
    const key = `${normalizeMarketName(row.market)}|${row.date}`;
    const prev = map.get(key);
    if (!prev || (row.modal_price ?? 0) >= (prev.modal_price ?? 0)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

async function fetchDataGovByDate(
  env: Env,
  commodity: string,
  state: string,
  arrivalDate: string,
): Promise<PriceRecord[]> {
  const rows = await fetchDataGovPaginated(
    env.DATA_GOV_API_KEY,
    commodity,
    "",
    state,
    {
      limit: 500,
      enoughRows: 3000,
      maxOffset: 6000,
      arrivalDate,
    },
  );
  return rows.filter((r) => commodityMatches(commodity, r.commodity));
}

function sampleRecords(records: PriceRecord[], sampleSize = 5) {
  return records.slice(0, sampleSize).map((r) => ({
    market: r.market ?? "",
    date: r.date ?? "",
    commodity: r.commodity ?? "",
  }));
}

function normalizeText(value: string): string {
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
  const requestedNormalized = normalizeText(requestedMarket);
  const requestedAlias = normalizeMarketAlias(requestedMarket);
  const uniqueMarkets = [
    ...new Set(records.map((r) => r.market).filter(Boolean)),
  ];

  const withMeta = uniqueMarkets.map((market) => {
    const normalized = normalizeText(market);
    const aliasNormalized = normalizeMarketAlias(market);
    return { market, normalized, aliasNormalized };
  });

  const byDeterministicOrder = (a: { market: string }, b: { market: string }) =>
    a.market.localeCompare(b.market, "en", { sensitivity: "base" });

  const exact = withMeta
    .filter((entry) => entry.normalized === requestedNormalized)
    .sort(byDeterministicOrder)[0];
  if (exact)
    return {
      matchedMarket: exact.market,
      matchType: "normalized-equality" as const,
    };

  const contains = withMeta
    .filter((entry) => {
      if (!requestedNormalized || !entry.normalized) return false;
      return (
        entry.normalized.includes(requestedNormalized) ||
        requestedNormalized.includes(entry.normalized)
      );
    })
    .sort((a, b) => {
      const aDelta = Math.abs(a.normalized.length - requestedNormalized.length);
      const bDelta = Math.abs(b.normalized.length - requestedNormalized.length);
      if (aDelta !== bDelta) return aDelta - bDelta;
      return byDeterministicOrder(a, b);
    })[0];
  if (contains)
    return {
      matchedMarket: contains.market,
      matchType: "contains-match" as const,
    };

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
  if (aliasMatch)
    return {
      matchedMarket: aliasMatch.market,
      matchType: "alias-apmc-match" as const,
    };

  return { matchedMarket: null, matchType: "none" as const };
}

function commodityMatches(
  selectedCrop: string,
  datasetCommodity: string,
): boolean {
  const normalizedCrop = normalizeText(selectedCrop);
  const normalizedCommodity = normalizeText(datasetCommodity);
  if (!normalizedCrop || !normalizedCommodity) return false;
  return (
    normalizedCommodity.includes(normalizedCrop) ||
    normalizedCrop.includes(normalizedCommodity)
  );
}

function sampleCommodityValues(
  records: PriceRecord[],
  sampleSize = 8,
): string[] {
  return [
    ...new Set(records.map((r) => (r.commodity ?? "").trim()).filter(Boolean)),
  ].slice(0, sampleSize);
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

function buildCompareResponseFromRows(
  rows: PriceRecord[],
  days: number,
  metadata: {
    freshnessDays: number | null;
    source: "live" | "fallback" | "kv";
    debug?: CacheDebugFields;
  },
  cacheKey: string,
): Response {
  const usableRows = rows.filter((r) => Boolean(r.market && r.date));
  const sourceRows = usableRows.length > 0 ? usableRows : rows;
  const byMandi = new Map<string, PriceRecord[]>();
  for (const row of sourceRows) {
    if (!byMandi.has(row.market)) byMandi.set(row.market, []);
    byMandi.get(row.market)!.push(row);
  }

  const latestDate =
    sourceRows
      .map((r) => r.date)
      .sort((a, b) => parseArrivalDate(b) - parseArrivalDate(a))[0] ?? null;

  const mandiSummaries = Array.from(byMandi.entries())
    .map(([mandi, recs]) => {
      const sorted = [...recs].sort(
        (a, b) => parseArrivalDate(a.date) - parseArrivalDate(b.date),
      );
      const latest = sorted[sorted.length - 1];
      const recent = sorted.slice(-days);
      const avgPrice = recent.length
        ? Math.round(
            recent.reduce((sum, row) => sum + row.modal_price, 0) /
              recent.length,
          )
        : 0;
      const freshnessDays = getFreshnessDays(latest.date);
      return {
        mandi,
        todayPrice: latest.modal_price,
        avgPrice,
        lastUpdated: latest.date,
        stale: isDataStale(latest.date),
        freshnessDays,
      };
    })
    .sort((a, b) => {
      const byNewest =
        parseArrivalDate(b.lastUpdated) - parseArrivalDate(a.lastUpdated);
      if (byNewest !== 0) return byNewest;
      return b.todayPrice - a.todayPrice;
    });

  const data = {
    mandis:
      mandiSummaries.length > 0
        ? mandiSummaries
        : [
            {
              mandi: "No mandi data",
              todayPrice: 0,
              avgPrice: 0,
              lastUpdated: latestDate,
              stale: true,
            },
          ],
    lastUpdated: latestDate,
    freshnessDays: metadata.freshnessDays,
    source: metadata.source,
    kvAvailable: metadata.debug?.kvAvailable ?? false,
    cacheKey: metadata.debug?.cacheKey ?? cacheKey,
    cacheReadAttempted: metadata.debug?.cacheReadAttempted ?? false,
    cacheHit: metadata.debug?.cacheHit ?? false,
    cacheWriteAttempted: metadata.debug?.cacheWriteAttempted ?? false,
    cacheWriteSucceeded: metadata.debug?.cacheWriteSucceeded ?? false,
  };
  cache.set(cacheKey, { data, ts: Date.now() });
  return json(data);
}

function buildCompareRecentWindowResponse(
  rows: PriceRecord[],
  todayTs: number,
  source: "live" | "kv" | "live+kv" | "live-no-kv",
  windowDays: number,
  includeTodayOnly: boolean,
  cacheKey: string,
  debug?: CacheDebugFields,
): Response {
  const deduped = dedupePriceRowsByMandiDate(rows).filter((r) => {
    const freshnessDays = getFreshnessDays(r.date, todayTs);
    if (freshnessDays === null || freshnessDays < 0) return false;
    if (includeTodayOnly) return freshnessDays === 0;
    return freshnessDays <= Math.max(1, windowDays);
  });
  const byMandi = new Map<string, PriceRecord[]>();
  for (const row of deduped) {
    if (!row.market) continue;
    if (!byMandi.has(row.market)) byMandi.set(row.market, []);
    byMandi.get(row.market)!.push(row);
  }

  const mandis = Array.from(byMandi.entries())
    .map(([mandi, mandiRows]) => {
      const sorted = [...mandiRows].sort(
        (a, b) => parseArrivalDate(b.date) - parseArrivalDate(a.date),
      );
      const latest = sorted[0];
      const entries: CompareMandiDateEntry[] = sorted.map((row) => ({
        date: row.date,
        freshnessDays: getFreshnessDays(row.date, todayTs),
        price: row.modal_price,
        minPrice: row.min_price,
        maxPrice: row.max_price,
        variety: row.variety,
      }));
      const avgPrice = entries.length
        ? Math.round(
            entries.reduce((sum, e) => sum + e.price, 0) / entries.length,
          )
        : 0;
      return {
        mandi,
        todayPrice: latest?.modal_price ?? 0,
        avgPrice,
        lastUpdated: latest?.date ?? null,
        stale: latest ? isDataStale(latest.date) : true,
        freshnessDays: latest ? getFreshnessDays(latest.date, todayTs) : null,
        entries,
      };
    })
    .sort(
      (a, b) =>
        parseArrivalDate(b.lastUpdated ?? "") -
          parseArrivalDate(a.lastUpdated ?? "") || b.todayPrice - a.todayPrice,
    );

  const availableDates = [
    ...new Set(
      deduped
        .map((r) => ({ ts: parseArrivalDate(r.date), date: r.date }))
        .filter((d) => d.ts > 0)
        .sort((a, b) => b.ts - a.ts)
        .map((d) => d.date),
    ),
  ];

  const body = {
    mandis,
    source,
    windowDays: includeTodayOnly ? 1 : windowDays,
    availableDates,
    totalRecordCount: deduped.length,
    totalMandiCount: mandis.length,
    freshnessDays: mandis[0]?.freshnessDays ?? null,
    lastUpdated: availableDates[0] ?? null,
    kvAvailable: debug?.kvAvailable ?? false,
    cacheKey: debug?.cacheKey ?? cacheKey,
    cacheReadAttempted: debug?.cacheReadAttempted ?? false,
    cacheHit: debug?.cacheHit ?? false,
    cacheWriteAttempted: debug?.cacheWriteAttempted ?? false,
    cacheWriteSucceeded: debug?.cacheWriteSucceeded ?? false,
    status:
      mandis.length === 0
        ? includeTodayOnly
          ? "no_today_data"
          : "no_recent_data"
        : "ok",
  };
  cache.set(cacheKey, { data: body, ts: Date.now() });
  return json(body);
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
  if (state) params.set("filters[state]", state);
  if (arrivalDate) params.set("filters[arrival_date]", arrivalDate);

  const url = `${DATA_GOV_BASE}/${RESOURCE_ID}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);

  const body = (await res.json()) as { records?: any[] };

  return (body.records || [])
    .filter(
      (r: any) =>
        r.modal_price && Number(r.modal_price) >= 50 && r.arrival_date,
    )
    .map((r: any) => ({
      date: r.arrival_date,
      market: r.market,
      district: r.district ?? "",
      state: r.state ?? "",
      commodity: r.commodity,
      variety: r.variety ?? undefined,
      price: Number(r.modal_price),
      min_price: Number(r.min_price),
      max_price: Number(r.max_price),
      modal_price: Number(r.modal_price),
    }))
    .sort(
      (a: PriceRecord, b: PriceRecord) =>
        parseArrivalDate(a.date) - parseArrivalDate(b.date),
    );
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
    const page = await fetchDataGov(
      apiKey,
      commodity,
      market,
      state,
      limit,
      offset,
      arrivalDate,
    );
    allRecords.push(...page);
    if (offset > 0 && page.length > 0) {
      console.log(
        JSON.stringify({
          route: "fetchDataGovPaginated",
          limit,
          offset,
          pageRows: page.length,
          totalRows: allRecords.length,
        }),
      );
    }
    if (page.length < limit) break;
    if (allRecords.length >= enoughRows) break;
  }
  return allRecords;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handlePrices(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const market = params.get("market") ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days = Number(params.get("days") ?? "30");

  if (!crop || !market) {
    return json({ error: "crop and market are required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey = `prices:${commodity}:${market}:${state}:${days}`;
  const debugBase = {
    kvAvailable: Boolean(env.RECENT_MANDI_KV),
    cacheKey,
    cacheReadAttempted: false,
    cacheHit: false,
    cacheWriteAttempted: false,
    cacheWriteSucceeded: false,
  };
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({
      ...(cached.data as object),
      fromCache: true,
      stale: false,
      ...debugBase,
      cacheHit: true,
      source: "memory-cache",
    });
  }

  try {
    const exactMarketRecords = await fetchDataGov(
      env.DATA_GOV_API_KEY,
      "",
      market,
      state,
      Math.max(days, 200),
    );
    let cropMatchedRecords = exactMarketRecords.filter((r) =>
      commodityMatches(commodity, r.commodity),
    );
    let selectedMarketRecords = cropMatchedRecords;
    let matchedMarket = market;
    let usedMarketFallback = false;
    let marketMatchType:
      | "normalized-equality"
      | "contains-match"
      | "alias-apmc-match"
      | "none" = "normalized-equality";

    if (!cropMatchedRecords.length) {
      usedMarketFallback = true;
      const fallbackRecords = await fetchDataGov(
        env.DATA_GOV_API_KEY,
        "",
        "",
        state,
        1000,
      );
      const cropScoped = fallbackRecords.filter((r) =>
        commodityMatches(commodity, r.commodity),
      );
      cropMatchedRecords = cropScoped;
      const picked = pickBestMarketMatch(cropScoped, market);
      matchedMarket = picked.matchedMarket ?? market;
      marketMatchType = picked.matchType;
      selectedMarketRecords = picked.matchedMarket
        ? cropScoped.filter(
            (r) =>
              normalizeText(r.market) === normalizeText(picked.matchedMarket),
          )
        : [];
    } else {
      const picked = pickBestMarketMatch(cropMatchedRecords, market);
      matchedMarket = picked.matchedMarket ?? market;
      marketMatchType = picked.matchType;
      selectedMarketRecords = picked.matchedMarket
        ? cropMatchedRecords.filter(
            (r) =>
              normalizeText(r.market) === normalizeText(picked.matchedMarket),
          )
        : [];
    }

    console.log(
      JSON.stringify({
        route: "/api/prices",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeText(commodity),
        sampleCommodityValues: sampleCommodityValues(exactMarketRecords),
        requestedMarket: market,
        matchedMarket,
        matchedRows: selectedMarketRecords.length,
        usedMarketFallback,
        marketMatchType,
      }),
    );

    if (!selectedMarketRecords.length) {
      const emptyResponse = {
        data: [],
        currentPrice: null,
        priceRange: { low: null, high: null },
        lastUpdated: null,
        stale: true,
        freshnessDays: null,
        source: "empty",
        requestedMarket: market,
        matchedMarket: null,
        matchedMarketCount: 0,
        recordCount: 0,
        usableCount: 0,
        ...debugBase,
      };
      cache.set(cacheKey, { data: emptyResponse, ts: Date.now() });
      return json(emptyResponse);
    }

    const { records: fallbackRecords, metadata } = selectWithFallback(
      selectedMarketRecords,
    );
    const trimmed = (
      fallbackRecords.length > 0 ? fallbackRecords : selectedMarketRecords
    ).slice(-days);
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
      freshnessDays: metadata.freshnessDays,
      source: metadata.source,
      requestedMarket: market,
      matchedMarket,
      matchedMarketCount: selectedMarketRecords.length,
      recordCount: selectedMarketRecords.length,
      usableCount: trimmed.length,
      ...debugBase,
    };
    cache.set(cacheKey, { data, ts: Date.now() });
    return json(data);
  } catch {
    if (cached)
      return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json(
      {
        error: "data.gov.in unavailable",
        data: [],
        currentPrice: null,
        priceRange: { low: null, high: null },
        lastUpdated: null,
        freshnessDays: null,
        source: "fallback",
        ...debugBase,
      },
      502,
    );
  }
}

async function handleTrend(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const market = params.get("market") ?? "";
  const state = params.get("state") ?? "Maharashtra";

  if (!crop || !market) {
    return json({ error: "crop and market are required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey = `prices:${commodity}:${market}:${state}`;
  const cached = cache.get(cacheKey);

  let records: PriceRecord[] = cached ? ((cached.data as any).data ?? []) : [];

  if (!records.length) {
    try {
      records = await fetchDataGov(
        env.DATA_GOV_API_KEY,
        commodity,
        market,
        state,
        30,
      );
      const pricesArr = records.map((r) => r.modal_price);
      const latest = records[records.length - 1] ?? null;
      cache.set(cacheKey, {
        ts: Date.now(),
        data: {
          data: records,
          currentPrice: latest?.modal_price ?? null,
          priceRange: {
            low: pricesArr.length ? Math.min(...pricesArr) : null,
            high: pricesArr.length ? Math.max(...pricesArr) : null,
          },
          lastUpdated: latest?.date ?? null,
          stale: latest ? isDataStale(latest.date) : true,
          source: "live",
        },
      });
    } catch {
      /* fall through with empty records */
    }
  }

  const prices = records
    .map((r) => r.modal_price || r.price)
    .filter((p) => p > 0);

  function ma(n: number): number | null {
    if (prices.length < n) return null;
    const slice = prices.slice(-n);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  const ma5val = ma(5);
  const ma10val = ma(10);
  const currentPrice = prices[prices.length - 1] ?? null;
  const prevPrice = prices[prices.length - 2] ?? currentPrice;
  const latest = records[records.length - 1] ?? null;

  let trend: "rising" | "falling" | "stable" = "stable";
  if (ma5val !== null && ma10val !== null) {
    if (ma5val > ma10val * 1.001) trend = "rising";
    else if (ma5val < ma10val * 0.999) trend = "falling";
  } else if (currentPrice !== null && prevPrice !== null) {
    if (currentPrice > prevPrice * 1.001) trend = "rising";
    else if (currentPrice < prevPrice * 0.999) trend = "falling";
  }

  const diff =
    currentPrice != null && prevPrice != null ? currentPrice - prevPrice : null;
  const priceDiff =
    diff != null ? `${diff >= 0 ? "+" : ""}₹${Math.round(diff)}` : null;

  return json({
    trend,
    ma5: ma5val !== null ? ma5val.toFixed(0) : null,
    ma10: ma10val !== null ? ma10val.toFixed(0) : null,
    currentPrice,
    priceDiff,
    lastUpdated: latest?.date ?? null,
    stale: latest ? isDataStale(latest.date) : true,
    recordCount: records.length,
  });
}

async function handleCompare(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const state = params.get("state") ?? "Maharashtra";
  const days = Number(params.get("days") ?? "7");

  if (!crop) {
    return json({ error: "crop is required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const cacheKey = `compare:${commodity}:${state}:${days}`;
  const compareDebug: CacheDebugFields = {
    kvAvailable: Boolean(env.RECENT_MANDI_KV),
    cacheKey,
    cacheReadAttempted: false,
    cacheHit: false,
    cacheWriteAttempted: false,
    cacheWriteSucceeded: false,
    source: "live-no-kv",
  };
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({
      ...(cached.data as object),
      fromCache: true,
      cacheHit: true,
      source: "memory-cache",
    });
  }

  try {
    const todayTs = startOfUtcDayTs();
    if (days <= 3) {
      const includeTodayOnly = days <= 1;
      const windowDays = includeTodayOnly ? 1 : 3;
      const dateWindow = getRecentDateWindow(todayTs, windowDays);
      const liveRows: PriceRecord[] = [];
      compareDebug.cacheReadAttempted = Boolean(env.RECENT_MANDI_KV);
      const kvRows = await readRecentDataFromKv(env, crop, state, todayTs);
      const freshKvRows = dedupePriceRowsByMandiDate(kvRows).filter((row) => {
        const freshness = getFreshnessDays(row.date, todayTs);
        if (freshness === null || freshness < 0) return false;
        return includeTodayOnly ? freshness === 0 : freshness <= windowDays;
      });
      if (freshKvRows.length > 0) {
        compareDebug.cacheHit = true;
        compareDebug.source = "kv";
        return buildCompareRecentWindowResponse(
          freshKvRows,
          todayTs,
          "kv",
          windowDays,
          includeTodayOnly,
          cacheKey,
          compareDebug,
        );
      }

      for (const day of dateWindow) {
        let dayLiveRows: PriceRecord[] = [];
        try {
          dayLiveRows = await fetchDataGovByDate(
            env,
            commodity,
            state,
            day.displayDate,
          );
        } catch {
          dayLiveRows = [];
        }
        if (dayLiveRows.length > 0) {
          liveRows.push(...dayLiveRows);
        }
      }
      const writeResult = await writeRecentDataToKv(
        env,
        crop,
        state,
        liveRows,
        todayTs,
      );
      compareDebug.cacheWriteAttempted = writeResult.attempted;
      compareDebug.cacheWriteSucceeded = writeResult.succeeded;
      compareDebug.source = env.RECENT_MANDI_KV ? "live+kv" : "live-no-kv";
      const source: "live" | "kv" | "live+kv" | "live-no-kv" =
        env.RECENT_MANDI_KV ? "live+kv" : "live-no-kv";
      return buildCompareRecentWindowResponse(
        dedupePriceRowsByMandiDate(liveRows),
        todayTs,
        source,
        windowDays,
        includeTodayOnly,
        cacheKey,
        compareDebug,
      );
    }

    const records = await fetchDataGovPaginated(
      env.DATA_GOV_API_KEY,
      "",
      "",
      "",
      {
        limit: 500,
        enoughRows: 2500,
        maxOffset: 5000,
      },
    );
    const cropFilteredRecords = records.filter((r) =>
      commodityMatches(commodity, r.commodity),
    );
    const normalizedState = normalizeText(state);
    const stateFilteredRecords = cropFilteredRecords.filter((r) => {
      const rowState = normalizeText(r.state || "");
      if (!rowState || !normalizedState) return false;
      return (
        rowState.includes(normalizedState) || normalizedState.includes(rowState)
      );
    });
    const usedStateFallback = stateFilteredRecords.length === 0;
    const finalRows = usedStateFallback
      ? cropFilteredRecords
      : stateFilteredRecords;

    console.log(
      JSON.stringify({
        route: "/api/compare",
        selectedCrop: crop,
        normalizedSelectedCrop: normalizeText(commodity),
        sampleCommodityValues: sampleCommodityValues(records),
        state,
        totalRowsFetched: records.length,
        rowsAfterCropFilter: cropFilteredRecords.length,
        rowsAfterStateFilter: stateFilteredRecords.length,
        usedStateFallback,
      }),
    );

    if (!cropFilteredRecords.length) {
      compareDebug.cacheReadAttempted = Boolean(env.RECENT_MANDI_KV);
      const kvRows = await readRecentDataFromKv(env, crop, state, todayTs);
      if (kvRows.length > 0) {
        compareDebug.cacheHit = true;
        compareDebug.source = "kv";
        return buildCompareResponseFromRows(
          kvRows,
          days,
          {
            freshnessDays: getFreshnessDays(kvRows[0]?.date ?? "", todayTs),
            source: "kv",
            debug: compareDebug,
          },
          cacheKey,
        );
      }
      return json({
        mandis: [
          {
            mandi: "No mandi data",
            todayPrice: 0,
            avgPrice: 0,
            lastUpdated: null,
            stale: true,
          },
        ],
        lastUpdated: null,
        freshnessDays: null,
        source: "fallback",
        ...compareDebug,
      });
    }

    const selected = selectWithFallback(finalRows, todayTs);
    const candidateRecords =
      selected.records.length > 0 ? selected.records : finalRows;
    const usableRows = candidateRecords.filter((r) =>
      Boolean(r.market && r.commodity && r.date),
    );
    let finalCandidateRows =
      usableRows.length > 0 ? usableRows : candidateRecords;
    let source: "live" | "fallback" | "kv" = selected.metadata.source;
    let freshnessDays = selected.metadata.freshnessDays;

    const hasRecentApiRows = finalCandidateRows.some((r) => {
      const d = getFreshnessDays(r.date, todayTs);
      return d !== null && d >= 0 && d <= 3;
    });

    if (!hasRecentApiRows) {
      compareDebug.cacheReadAttempted = Boolean(env.RECENT_MANDI_KV);
      const kvRows = await readRecentDataFromKv(env, crop, state, todayTs);
      if (kvRows.length > 0) {
        finalCandidateRows = kvRows;
        source = "kv";
        freshnessDays = getFreshnessDays(kvRows[0]?.date ?? "", todayTs);
        compareDebug.cacheHit = true;
        compareDebug.source = "kv";
      } else {
        finalCandidateRows = [];
        source = "fallback";
        freshnessDays = null;
        compareDebug.source = "fallback";
      }
    } else {
      const writeResult = await writeRecentDataToKv(
        env,
        crop,
        state,
        finalRows,
        todayTs,
      );
      compareDebug.cacheWriteAttempted = writeResult.attempted;
      compareDebug.cacheWriteSucceeded = writeResult.succeeded;
    }

    return buildCompareResponseFromRows(
      finalCandidateRows,
      days,
      {
        freshnessDays,
        source,
        debug: {
          ...compareDebug,
          source,
        },
      },
      cacheKey,
    );
  } catch {
    if (cached)
      return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json(
      {
        error: "data.gov.in unavailable",
        mandis: [
          {
            mandi: "No mandi data",
            todayPrice: 0,
            avgPrice: 0,
            lastUpdated: null,
            stale: true,
          },
        ],
        freshnessDays: null,
        source: "fallback",
        ...compareDebug,
      },
      502,
    );
  }
}

async function handleCrops(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
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
    const bucket = new Map<
      string,
      { latestTs: number; latestDate: string; recordCount: number }
    >();

    for (let dayOffset = 0; dayOffset <= windowDays; dayOffset += 1) {
      const probeDate = new Date(today);
      probeDate.setDate(today.getDate() - dayOffset);
      const arrivalDate = formatDateDdMmYyyy(probeDate);
      const rows = await fetchDataGov(
        env.DATA_GOV_API_KEY,
        "",
        "",
        state,
        200,
        arrivalDate,
      );

      for (const row of rows) {
        const commodity = row.commodity?.trim();
        if (!commodity) continue;
        const ts = parseArrivalDate(row.date);
        if (!ts) continue;

        const ageDays = Math.floor(
          (today.getTime() - ts) / (24 * 60 * 60 * 1000),
        );
        if (ageDays < 0 || ageDays > windowDays) continue;

        const existing = bucket.get(commodity);
        if (!existing) {
          bucket.set(commodity, {
            latestTs: ts,
            latestDate: row.date,
            recordCount: 1,
          });
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
        const byDate =
          parseArrivalDate(b.latestDate) - parseArrivalDate(a.latestDate);
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
    if (cached)
      return json({ ...(cached.data as object), fromCache: true, stale: true });
    return json(
      {
        crops: getActiveCropFallback(),
        windowDays,
        source: "fallback_active",
        stale: true,
        error: "data.gov.in unavailable",
      },
      200,
    );
  }
}

async function handleRecommendation(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const state = params.get("state") ?? "Maharashtra";

  if (!crop) {
    return json({ error: "crop is required" }, 400);
  }

  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const tracingCrop = "Onion";
  const traceEnabled =
    commodity.trim().toLowerCase() === tracingCrop.toLowerCase();

  try {
    const upstreamLimit = 500;
    const upstreamRecords = await fetchDataGov(
      env.DATA_GOV_API_KEY,
      commodity,
      "",
      state,
      upstreamLimit,
    );
    const afterDateParsing = upstreamRecords.filter(
      (r) => parseArrivalDate(r.date) > 0,
    );
    const afterCropFiltering = afterDateParsing.filter((r) =>
      commodityMatches(commodity, r.commodity),
    );
    const afterMandiNormalization = afterCropFiltering.filter(
      (r) => normalizeMarketName(r.market).length > 0,
    );
    const usable = afterMandiNormalization.filter(
      (r) =>
        r &&
        r.market &&
        r.commodity &&
        r.modal_price !== null &&
        r.modal_price !== undefined &&
        Number.isFinite(r.modal_price) &&
        r.modal_price > 0,
    );
    const finalRecords = [...usable].sort(
      (a, b) => b.modal_price - a.modal_price,
    );

    const cropUniverseWindowDays = 15;
    const cropUniverseRecords = await fetchDataGov(
      env.DATA_GOV_API_KEY,
      "",
      "",
      state,
      upstreamLimit,
    );
    const cropUniverseTodayTs = startOfUtcDayTs();
    const cropUniverseRecent = cropUniverseRecords.filter((row) => {
      const freshnessDays = getFreshnessDays(row.date, cropUniverseTodayTs);
      return (
        freshnessDays !== null &&
        freshnessDays >= 0 &&
        freshnessDays <= cropUniverseWindowDays
      );
    });
    const cropInRecentUniverse = cropUniverseRecent.some((row) =>
      commodityMatches(commodity, row.commodity),
    );
    const cropInFetchedDataset = upstreamRecords.some((row) =>
      commodityMatches(commodity, row.commodity),
    );

    const pipelineTrace = {
      crop: commodity,
      normalizedSelectedCrop: normalizeText(commodity),
      state,
      fetchScope: {
        resultLimitPerRequest: upstreamLimit,
        pagination: "No offset used; first page only",
        mandiLimit:
          "No explicit mandi cap; constrained by first-page row limit",
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
        rawUpstreamFetched: {
          count: upstreamRecords.length,
          sample: sampleRecords(upstreamRecords),
        } satisfies RecommendationTraceStage,
        afterDateParsing: {
          count: afterDateParsing.length,
          sample: sampleRecords(afterDateParsing),
        } satisfies RecommendationTraceStage,
        afterCropFiltering: {
          count: afterCropFiltering.length,
          sample: sampleRecords(afterCropFiltering),
        } satisfies RecommendationTraceStage,
        afterMandiNormalization: {
          count: afterMandiNormalization.length,
          sample: sampleRecords(afterMandiNormalization),
        } satisfies RecommendationTraceStage,
        afterUsabilityFiltering: {
          count: usable.length,
          sample: sampleRecords(usable),
        } satisfies RecommendationTraceStage,
        finalRecordsReturned: {
          count: finalRecords.length,
          sample: sampleRecords(finalRecords),
        } satisfies RecommendationTraceStage,
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
      sorted.reduce((sum, r) => sum + r.modal_price, 0) / sorted.length,
    );

    const current = usable[0];
    const gapFromBest = best.modal_price - current.modal_price;

    let action = "CHECK OTHER MANDI";
    let confidence = "medium";
    let reason = "Better mandi prices are available in the current results.";

    if (current.market === best.market || gapFromBest <= average * 0.05) {
      action = "SELL";
      confidence = "high";
      reason =
        "Your current mandi is at or near the best available modal price.";
    } else if (gapFromBest > average * 0.2) {
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
    return json(
      {
        error: "data.gov.in unavailable",
        action: "CHECK",
        confidence: "low",
        reason: "Could not fetch mandi data right now.",
        summary: "Recommendation unavailable.",
      },
      502,
    );
  }
}

async function handleHealth(): Promise<Response> {
  return json({
    status: "ok",
    runtime: "cloudflare-worker",
    version: "worker-ts-v2",
    ts: Date.now(),
  });
}

async function handleDebug(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const state = params.get("state") ?? "";
  const records = await fetchDataGovPaginated(
    env.DATA_GOV_API_KEY,
    "",
    "",
    state,
    {
      limit: 500,
      enoughRows: 3000,
      maxOffset: 5000,
    },
  );

  return json({
    totalRows: records.length,
    sampleRows: records.slice(0, 10).map((r) => ({
      commodity: r.commodity,
      market: r.market,
      state: r.state,
      district: r.district,
      arrival_date: r.date,
      modal_price: r.modal_price,
    })),
  });
}

async function handleDebugMatch(
  params: URLSearchParams,
  env: Env,
): Promise<Response> {
  const crop = params.get("crop") ?? "";
  const state = params.get("state") ?? "";
  const commodity = CROP_MAP[crop.toLowerCase()] ?? crop;
  const normalizedState = normalizeText(state);
  const records = await fetchDataGovPaginated(
    env.DATA_GOV_API_KEY,
    "",
    "",
    "",
    {
      limit: 500,
      enoughRows: 3000,
      maxOffset: 5000,
    },
  );

  const cropMatchedRows = records.filter((r) =>
    commodityMatches(commodity, r.commodity),
  );
  const stateMatchedRows = cropMatchedRows.filter((r) => {
    const rowState = normalizeText(r.state || "");
    if (!normalizedState || !rowState) return false;
    return (
      rowState.includes(normalizedState) || normalizedState.includes(rowState)
    );
  });

  const toSampleRow = (r: PriceRecord) => ({
    commodity: r.commodity,
    market: r.market,
    state: r.state,
    district: r.district,
    arrival_date: r.date,
    modal_price: r.modal_price,
  });

  return json({
    totalRows: records.length,
    cropMatches: cropMatchedRows.length,
    stateMatches: stateMatchedRows.length,
    cropSamples: cropMatchedRows.slice(0, 10).map(toSampleRow),
    stateSamples: stateMatchedRows.slice(0, 10).map(toSampleRow),
  });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/debug") {
      const rows = await fetchDataGovPaginated(env, {
        limit: 500,
        maxOffset: 1000,
      });

      return new Response(
        JSON.stringify({
          total: rows.length,
          sample: rows.slice(0, 10),
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    }

    const path = url.pathname;
    const params = url.searchParams;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (path === "/api/health") return handleHealth();
    if (path === "/api/prices") return handlePrices(params, env);
    if (path === "/api/trend") return handleTrend(params, env);
    if (path === "/api/compare") return handleCompare(params, env);
    if (path === "/api/crops") return handleCrops(params, env);
    if (path === "/api/recommendation")
      return handleRecommendation(params, env);
    if (path === "/api/debug") return handleDebug(params, env);
    if (path === "/api/debug/match") return handleDebugMatch(params, env);

    return json({ error: "Not found" }, 404);
  },
};
