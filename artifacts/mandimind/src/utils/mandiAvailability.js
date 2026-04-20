import { fetchCompare, fetchCropUniverse, fetchPrices } from "./api";
import { getCropNames } from "../data/mockPrices";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE = "Maharashtra";
const DEFAULT_MAX_FRESHNESS_DAYS = 3;

export const DATA_FRESHNESS = {
  LIVE: "LIVE",
  RECENT: "RECENT",
  STALE: "STALE",
};
export const PRICE_MODE = {
  TODAY: "today",
  RECENT: "latest",
};

export function getFreshnessMessage(freshnessDays) {
  if (!Number.isFinite(freshnessDays)) return "Showing latest available";
  if (freshnessDays === 0) return "Today’s data";
  if (freshnessDays <= DEFAULT_MAX_FRESHNESS_DAYS) return "Recent mode (up to 3 days)";
  return `Showing latest available data (${freshnessDays} days old)`;
}

export function parseArrivalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  const ddMmYyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]);
    const year = Number(ddMmYyyy[3]);
    const utcTs = Date.UTC(year, month - 1, day);
    const parsed = new Date(utcTs);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const utcTs = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return new Date(utcTs);
}

export function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getFreshnessDays(parsedDate, today = startOfDay(new Date())) {
  return Math.max(0, Math.floor((today.getTime() - startOfDay(parsedDate).getTime()) / DAY_MS));
}

export function classifyByDate(dateStr, today = startOfDay(new Date())) {
  const parsedDate = parseArrivalDate(dateStr);
  if (!parsedDate) {
    return { freshness: DATA_FRESHNESS.STALE, freshnessDays: null, parsedDate: null };
  }
  const freshnessDays = getFreshnessDays(parsedDate, today);
  if (freshnessDays === 0) {
    return { freshness: DATA_FRESHNESS.LIVE, freshnessDays, parsedDate };
  }
  if (freshnessDays >= 1 && freshnessDays <= 3) {
    return { freshness: DATA_FRESHNESS.RECENT, freshnessDays, parsedDate };
  }
  return { freshness: DATA_FRESHNESS.STALE, freshnessDays, parsedDate };
}

function normalizeRawRow(row) {
  if (!row || typeof row !== "object") return null;
  const mandi = typeof row.market === "string" ? row.market.trim() : "";
  if (!mandi) return null;
  const price = row.modal_price ?? row.price;
  const parsedDate = parseArrivalDate(row.date);
  if (!Number.isFinite(price) || !parsedDate) return null;
  return {
    mandi,
    price,
    date: row.date,
    parsedDate,
    raw: row,
  };
}

function selectBestRow(rows, predicate = () => true) {
  const matching = rows.filter(predicate);
  if (!matching.length) return null;
  return matching.sort((a, b) => {
    const byDate = b.parsedDate.getTime() - a.parsedDate.getTime();
    if (byDate !== 0) return byDate;
    return b.price - a.price;
  })[0];
}

function deriveMandiRows(rows, options = {}) {
  const { recentWindowDays = DEFAULT_MAX_FRESHNESS_DAYS } = options;
  const today = startOfDay(new Date());
  const todayTs = today.getTime();
  const sortedRows = [...rows].sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
  const todayRow = selectBestRow(sortedRows, (row) => startOfDay(row.parsedDate).getTime() === todayTs);
  const recentRow = selectBestRow(sortedRows, (row) => {
    const freshnessDays = getFreshnessDays(row.parsedDate, today);
    return freshnessDays >= 1 && freshnessDays <= recentWindowDays;
  });
  const latestAvailableRow = sortedRows[0] ?? null;

  const latestFreshnessDays = latestAvailableRow
    ? getFreshnessDays(latestAvailableRow.parsedDate, today)
    : null;

  return {
    todayRow,
    recentRow,
    latestAvailableRow,
    todayOption: todayRow
      ? { isUsable: true, price: todayRow.price, date: todayRow.date, freshnessDays: 0 }
      : { isUsable: false, price: null, date: null, freshnessDays: null },
    latestOption: recentRow
      ? {
          isUsable: true,
          price: recentRow.price,
          date: recentRow.date,
          freshnessDays: getFreshnessDays(recentRow.parsedDate, today),
        }
      : { isUsable: false, price: null, date: null, freshnessDays: null },
    bucket: todayRow
      ? "live_today"
      : latestAvailableRow
        ? "latest_available"
        : "unavailable",
    isUsable: Boolean(latestAvailableRow),
    usedDate: latestAvailableRow?.date ?? null,
    freshnessDays: latestFreshnessDays,
    selectedPrice: latestAvailableRow?.price ?? null,
  };
}

export function getMandiAvailabilityFromRecords(records, options = {}) {
  const { maxFreshnessDays = DEFAULT_MAX_FRESHNESS_DAYS } = options;
  const normalizedRecords = (records ?? [])
    .map((row) => {
      const price = row?.price ?? row?.modal_price;
      const parsedDate = parseArrivalDate(row?.date);
      if (!Number.isFinite(price) || !parsedDate) return null;
      return {
        mandi: typeof row?.market === "string" ? row.market : "Unknown",
        price,
        date: row.date,
        parsedDate,
      };
    })
    .filter(Boolean);
  const derived = deriveMandiRows(normalizedRecords, { recentWindowDays: maxFreshnessDays });
  return derived;
}

function getRecentWindowAverage(priceRows, recentWindowDays = DEFAULT_MAX_FRESHNESS_DAYS) {
  const today = startOfDay(new Date());
  const recentPrices = (priceRows ?? [])
    .map((row) => {
      const price = row.modal_price ?? row.price;
      const parsedDate = parseArrivalDate(row.date);

      if (!Number.isFinite(price) || !parsedDate) return null;

      const freshnessDays = getFreshnessDays(parsedDate, today);
      if (freshnessDays > recentWindowDays) return null;

      return price;
    })
    .filter((price) => Number.isFinite(price));

  if (!recentPrices.length) return null;
  return Math.round(recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length);
}

function getRecentValidHistoryCount(priceRows, recentWindowDays = 7) {
  const today = startOfDay(new Date());

  return (priceRows ?? []).reduce((count, row) => {
    const price = row.modal_price ?? row.price;
    const parsedDate = parseArrivalDate(row.date);

    if (!Number.isFinite(price) || !parsedDate) return count;

    const freshnessDays = getFreshnessDays(parsedDate, today);

    if (freshnessDays > recentWindowDays) return count;
    return count + 1;
  }, 0);
}

function classifyMandiData({ mandiAvailability, recentHistoryCount, minHistoryPoints = 3 }) {
  if (!mandiAvailability.isUsable) return "unavailable";
  if (mandiAvailability.bucket === "live_today") {
    return recentHistoryCount >= minHistoryPoints ? "full" : "limited";
  }
  return "fallback_recent";
}

export function classifyPriceRows(priceRows = []) {
  const latestRecord = (priceRows ?? [])
    .map((row) => {
      const price = row.modal_price ?? row.price;
      const parsedDate = parseArrivalDate(row.date);
      if (!Number.isFinite(price) || !parsedDate) return null;
      return { price, date: row.date, parsedDate };
    })
    .filter(Boolean)
    .sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime())[0];

  if (!latestRecord) {
    return {
      freshness: DATA_FRESHNESS.STALE,
      freshnessDays: null,
      usedDate: null,
      isUsable: false,
      selectedPrice: null,
    };
  }

  const classification = classifyByDate(latestRecord.date);
  return {
    freshness: classification.freshness,
    freshnessDays: classification.freshnessDays,
    usedDate: latestRecord.date,
    isUsable: classification.freshness !== DATA_FRESHNESS.STALE,
    selectedPrice: latestRecord.price,
  };
}

export async function fetchAvailableMandis(cropId, state = "Maharashtra", options = {}) {
  if (typeof cropId !== "string" || !cropId.trim()) {
    return {
      mandis: [],
      lastUpdated: null,
      source: "error",
      error: "crop is required",
    };
  }

  const {
    compareDays = 30,
    historyDays = 30,
    recentWindowDays = DEFAULT_MAX_FRESHNESS_DAYS,
  } = options;

  const compareResult = await fetchCompare(cropId, state, compareDays);
  if (compareResult?.source === "error") {
    return {
      mandis: [],
      lastUpdated: null,
      source: "error",
      error: compareResult.error || "Unable to fetch mandi availability",
    };
  }

  const compareMandis = Array.isArray(compareResult?.mandis) ? compareResult.mandis : [];
  const compareByMandi = new Map(
    compareMandis
      .filter((item) => typeof item?.mandi === "string" && item.mandi.trim())
      .map((item) => [item.mandi.trim(), item])
  );
  const mandiNames = compareMandis
    .map((item) => (typeof item?.mandi === "string" ? item.mandi.trim() : ""))
    .filter((name) => name && name !== "No mandi data");

  const priceResults = await Promise.all(
    mandiNames.map(async (mandiName) => {
      const priceResult = await fetchPrices(cropId, mandiName, state, historyDays);
      const rows = (priceResult?.data ?? []).map(normalizeRawRow).filter(Boolean);
      return { mandiName, rows };
    })
  );

  const cropRows = priceResults.flatMap((result) => result.rows);
  const groupedByMandi = cropRows.reduce((acc, row) => {
    if (!acc.has(row.mandi)) acc.set(row.mandi, []);
    acc.get(row.mandi).push(row);
    return acc;
  }, new Map());

  const mandiStatus = Array.from(groupedByMandi.entries()).map(([mandi, rows]) => {
    const derivedRows = deriveMandiRows(rows, { recentWindowDays });
    const recentHistoryCount = getRecentValidHistoryCount(rows, recentWindowDays);
    const compareRow = compareByMandi.get(mandi) ?? null;
    const recentWindowAverage = getRecentWindowAverage(rows, recentWindowDays);
    return {
      mandi,
      ...derivedRows,
      todayPrice: derivedRows.todayRow?.price ?? null,
      currentPrice: derivedRows.todayRow?.price ?? null,
      latestPrice: derivedRows.latestAvailableRow?.price ?? null,
      todayDate: derivedRows.todayRow?.date ?? null,
      latestDate: derivedRows.latestAvailableRow?.date ?? null,
      latestFreshnessDays: derivedRows.latestAvailableRow
        ? getFreshnessDays(derivedRows.latestAvailableRow.parsedDate)
        : null,
      lastUpdated: derivedRows.latestAvailableRow?.date ?? null,
      availability: derivedRows.todayRow ? "full" : "fallback_recent",
      recentHistoryCount,
      recentAveragePrice: recentWindowAverage,
      compareTodayPrice: Number.isFinite(compareRow?.todayPrice) ? compareRow.todayPrice : null,
      compareAvgPrice: Number.isFinite(compareRow?.avgPrice) ? compareRow.avgPrice : null,
      compareFreshnessDays: Number.isFinite(compareRow?.freshnessDays) ? compareRow.freshnessDays : null,
      avgPrice: rows.length
        ? Math.round(rows.reduce((sum, row) => sum + row.price, 0) / rows.length)
        : (Number.isFinite(compareRow?.avgPrice) ? compareRow.avgPrice : null),
    };
  });

  const newestCropRow = cropRows.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime())[0] ?? null;
  const fallbackFreshnessDays = compareMandis
    .map((item) => (Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0] ?? null;
  const freshnessDays = newestCropRow ? getFreshnessDays(newestCropRow.parsedDate) : fallbackFreshnessDays;

  const compareOnlyStatus = compareMandis
    .filter((item) => {
      const mandiName = typeof item?.mandi === "string" ? item.mandi.trim() : "";
      return mandiName && !groupedByMandi.has(mandiName) && mandiName !== "No mandi data";
    })
    .map((item) => ({
      mandi: item.mandi,
      todayRow: null,
      recentRow: null,
      latestAvailableRow: null,
      todayOption: { isUsable: false, price: null, date: null, freshnessDays: null },
      latestOption: {
        isUsable: Number.isFinite(item?.todayPrice),
        price: Number.isFinite(item?.todayPrice) ? item.todayPrice : null,
        date: item?.lastUpdated ?? null,
        freshnessDays: Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null,
      },
      bucket: Number.isFinite(item?.todayPrice) ? "latest_available" : "unavailable",
      isUsable: Number.isFinite(item?.todayPrice),
      usedDate: item?.lastUpdated ?? null,
      freshnessDays: Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null,
      selectedPrice: Number.isFinite(item?.todayPrice) ? item.todayPrice : null,
      todayPrice: null,
      currentPrice: null,
      latestPrice: Number.isFinite(item?.todayPrice) ? item.todayPrice : null,
      todayDate: null,
      latestDate: item?.lastUpdated ?? null,
      latestFreshnessDays: Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null,
      lastUpdated: item?.lastUpdated ?? null,
      availability: Number.isFinite(item?.todayPrice) ? "fallback_recent" : "unavailable",
      recentHistoryCount: 0,
      recentAveragePrice: Number.isFinite(item?.avgPrice) ? item.avgPrice : null,
      compareTodayPrice: Number.isFinite(item?.todayPrice) ? item.todayPrice : null,
      compareAvgPrice: Number.isFinite(item?.avgPrice) ? item.avgPrice : null,
      compareFreshnessDays: Number.isFinite(item?.freshnessDays) ? item.freshnessDays : null,
      avgPrice: Number.isFinite(item?.avgPrice) ? item.avgPrice : null,
    }));

  const mergedMandiStatus = [...mandiStatus, ...compareOnlyStatus];


  return {
    ...compareResult,
    mandis: mergedMandiStatus,
    freshnessDays,
  };
}

export async function fetchClassifiedMandis(cropId, state = "Maharashtra", options = {}) {
  return fetchAvailableMandis(cropId, state, options);
}

export function getUsableMandis(mandis = []) {
  return mandis.filter((item) => item?.isUsable);
}

export function getMandisForPriceMode(mandis = [], mode = PRICE_MODE.TODAY, options = {}) {
  const { includeTodayInLatest = false } = options;
  const isTodayMode = mode === PRICE_MODE.TODAY;
  return (mandis ?? [])
    .map((item) => {
      const modeRow = isTodayMode
        ? item?.todayRow
        : (includeTodayInLatest ? (item?.latestAvailableRow ?? item?.recentRow) : item?.recentRow);
      const modeFreshnessDays = modeRow ? getFreshnessDays(modeRow.parsedDate) : null;
      return {
        ...item,
        mode,
        modePrice: modeRow?.price ?? null,
        modeDate: modeRow?.date ?? null,
        modeFreshnessDays,
        modeHasData: Boolean(modeRow),
        modeFallbackToLatest: false,
      };
    })
    .sort((a, b) => a.mandi.localeCompare(b.mandi));
}

export function splitMandisByFreshness(mandis = []) {
  const usable = mandis.filter((item) => item?.isUsable);
  return {
    live: usable.filter(
      (item) => item.bucket === "live_today" || item.freshness === DATA_FRESHNESS.LIVE
    ),
    recent: usable.filter(
      (item) => item.bucket === "latest_available" || item.freshness === DATA_FRESHNESS.RECENT
    ),
  };
}

export async function fetchAvailableCrops(state = DEFAULT_STATE) {
  const cropWindowDays = 15;
  const result = await fetchCropUniverse(state, cropWindowDays);
  const payloadCrops = Array.isArray(result?.crops)
    ? result.crops
    : Array.isArray(result?.data?.crops)
      ? result.data.crops
      : [];

  const normalized = payloadCrops
    .map((crop) => {
      if (typeof crop === "string" && crop.trim()) {
        return { id: crop.trim(), name: crop.trim(), commodity: crop.trim(), recordCount: 0, latestDate: null };
      }
      if (!crop || typeof crop !== "object") return null;
      const id = typeof crop.id === "string" ? crop.id.trim() : "";
      const commodity = typeof crop.commodity === "string" ? crop.commodity.trim() : id;
      const name = typeof crop.name === "string" ? crop.name.trim() : commodity || id;
      if (!id && !commodity && !name) return null;
      return {
        id: id || commodity || name,
        name: name || commodity || id,
        commodity: commodity || id || name,
        recordCount: Number.isFinite(crop.recordCount) ? crop.recordCount : 0,
        latestDate: typeof crop.latestDate === "string" ? crop.latestDate : null,
      };
    })
    .filter(Boolean);

  if (normalized.length > 0) {
    return normalized;
  }

  const localFallback = getCropNames().map((crop) => ({
    id: crop.id,
    name: crop.name,
    commodity: crop.name.split(" / ")[0],
    recordCount: 0,
    latestDate: null,
  }));

  if (result?.source === "error") {
    console.warn("[MandiMind] crop universe unavailable, using minimal active crop fallback");
  } else {
    console.warn("[MandiMind] crop universe empty, using minimal active crop fallback");
  }
  return localFallback;
}
