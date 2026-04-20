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
  if (freshnessDays <= 3) return "Last 3 days";
  return `Showing latest available (${freshnessDays} days old)`;
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

export function getMandiAvailabilityFromRecords(records, options = {}) {
  const { maxFreshnessDays = DEFAULT_MAX_FRESHNESS_DAYS } = options;
  const today = startOfDay(new Date());

  const normalizedRecords = (records ?? [])
    .map((row) => {
      const price = row.modal_price ?? row.price;
      const parsedDate = parseArrivalDate(row.date);
      if (!Number.isFinite(price) || !parsedDate) return null;
      return { price, date: row.date, parsedDate };
    })
    .filter(Boolean)
    .sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());

  if (!normalizedRecords.length) {
    return {
      bucket: "unavailable",
      isUsable: false,
      todayOption: { isUsable: false, price: null, date: null, freshnessDays: null },
      latestOption: { isUsable: false, price: null, date: null, freshnessDays: null },
    };
  }

  const liveToday = normalizedRecords.find(
    (row) => startOfDay(row.parsedDate).getTime() === today.getTime()
  );

  const latestWithinThreeDays = normalizedRecords.find((row) => {
    const freshnessDays = getFreshnessDays(row.parsedDate, today);
    return freshnessDays >= 1 && freshnessDays <= maxFreshnessDays;
  });

  const todayOption = liveToday
    ? { isUsable: true, price: liveToday.price, date: liveToday.date, freshnessDays: 0 }
    : { isUsable: false, price: null, date: null, freshnessDays: null };

  const latestOption = latestWithinThreeDays
    ? {
      isUsable: true,
      price: latestWithinThreeDays.price,
      date: latestWithinThreeDays.date,
      freshnessDays: getFreshnessDays(latestWithinThreeDays.parsedDate, today),
    }
    : { isUsable: false, price: null, date: null, freshnessDays: null };

  if (liveToday) {
    return {
      bucket: "live_today",
      isUsable: true,
      isLiveToday: true,
      usedDate: liveToday.date,
      freshnessDays: 0,
      selectedPrice: liveToday.price,
      todayOption,
      latestOption,
    };
  }

  const latest = normalizedRecords[0];
  const freshnessDays = getFreshnessDays(latest.parsedDate, today);

  return {
    bucket: freshnessDays > maxFreshnessDays ? "latest_older" : "latest_available",
    isUsable: true,
    isLiveToday: false,
    usedDate: latest.date,
    freshnessDays,
    selectedPrice: latest.price,
    todayOption,
    latestOption,
  };
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
  const {
    compareDays = 7,
    historyDays = 30,
    recentWindowDays = 7,
    minHistoryPoints = 3,
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

  const mandiStatus = await Promise.all(
    compareMandis.map(async (mandiItem) => {
      const mandiName = mandiItem?.mandi;

      if (!mandiName) return null;

      const priceResult = await fetchPrices(cropId, mandiName, state, historyDays);
      const mandiAvailability = getMandiAvailabilityFromRecords(priceResult?.data, {
        maxFreshnessDays: DEFAULT_MAX_FRESHNESS_DAYS,
      });
      const recentHistoryCount = getRecentValidHistoryCount(priceResult?.data, recentWindowDays);

      const availability = classifyMandiData({
        mandiAvailability,
        recentHistoryCount,
        minHistoryPoints,
      });

      return {
        ...mandiItem,
        ...mandiAvailability,
        todayPrice: mandiAvailability.selectedPrice ?? mandiItem.todayPrice,
        currentPrice: mandiAvailability.todayOption?.price ?? null,
        latestPrice: mandiAvailability.latestOption?.price ?? null,
        todayDate: mandiAvailability.todayOption?.date ?? null,
        latestDate: mandiAvailability.latestOption?.date ?? null,
        latestFreshnessDays: mandiAvailability.latestOption?.freshnessDays ?? null,
        lastUpdated: mandiAvailability.usedDate ?? mandiItem.lastUpdated,
        availability,
        recentHistoryCount,
      };
    })
  );

  const usableMandis = mandiStatus
    .filter(Boolean);

  return {
    ...compareResult,
    mandis: usableMandis.length > 0
      ? usableMandis
      : [{ mandi: "No mandi data", todayPrice: 0, avgPrice: 0, isUsable: false, availability: "unavailable" }],
  };
}

export async function fetchClassifiedMandis(cropId, state = "Maharashtra", options = {}) {
  return fetchAvailableMandis(cropId, state, options);
}

export function getUsableMandis(mandis = []) {
  return mandis.filter((item) => item?.isUsable);
}

export function getMandisForPriceMode(mandis = [], mode = PRICE_MODE.TODAY) {
  const isTodayMode = mode === PRICE_MODE.TODAY;
  return (mandis ?? [])
    .map((item) => {
      const modeOption = isTodayMode ? item?.todayOption : item?.latestOption;
      if (!modeOption?.isUsable && mode === PRICE_MODE.TODAY && item?.latestOption?.isUsable) {
        return {
          ...item,
          mode: PRICE_MODE.RECENT,
          modePrice: item.latestOption.price,
          modeDate: item.latestOption.date,
          modeFreshnessDays: item.latestOption.freshnessDays,
        };
      }
      if (!modeOption?.isUsable) return null;
      return {
        ...item,
        mode,
        modePrice: modeOption.price,
        modeDate: modeOption.date,
        modeFreshnessDays: modeOption.freshnessDays,
      };
    })
    .filter(Boolean);
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
