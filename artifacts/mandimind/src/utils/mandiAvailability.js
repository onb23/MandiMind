import { fetchCompare } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DATA_FRESHNESS = {
  LIVE: "LIVE",
  RECENT: "RECENT",
  STALE: "STALE",
};

function parseArrivalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [dd, mm, yyyy] = dateStr.split("/");
  if (!dd || !mm || !yyyy) return null;
  const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getFreshnessDays(parsedDate, today = startOfDay(new Date())) {
  return Math.max(0, Math.floor((today.getTime() - startOfDay(parsedDate).getTime()) / DAY_MS));
}

export function classifyByDate(dateStr, today = startOfDay(new Date())) {
  const parsedDate = parseArrivalDate(dateStr);
  if (!parsedDate) {
    return {
      freshness: DATA_FRESHNESS.STALE,
      freshnessDays: null,
      parsedDate: null,
    };
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

export async function fetchClassifiedMandis(cropId, state = "Maharashtra", options = {}) {
  const { compareDays = 7 } = options;

  const compareResult = await fetchCompare(cropId, state, compareDays);
  if (compareResult?.source === "error") {
    return {
      mandis: [],
      source: "error",
      lastUpdated: null,
      error: compareResult.error || "Unable to fetch mandi availability",
    };
  }

  const mandis = (Array.isArray(compareResult?.mandis) ? compareResult.mandis : []).map((item) => {
    const freshnessMeta = classifyByDate(item?.lastUpdated);
    return {
      ...item,
      freshness: freshnessMeta.freshness,
      freshnessDays: freshnessMeta.freshnessDays,
      isUsable: freshnessMeta.freshness !== DATA_FRESHNESS.STALE,
    };
  });

  return {
    ...compareResult,
    mandis,
  };
}

export function getUsableMandis(mandis = []) {
  return mandis.filter((item) => item?.isUsable);
}

export function splitMandisByFreshness(mandis = []) {
  const usable = getUsableMandis(mandis);
  return {
    live: usable.filter((item) => item.freshness === DATA_FRESHNESS.LIVE),
    recent: usable.filter((item) => item.freshness === DATA_FRESHNESS.RECENT),
  };
}

export async function fetchAvailableCrops(cropList, state = "Maharashtra") {
  const cropStatus = await Promise.all(
    cropList.map(async (crop) => {
      const result = await fetchClassifiedMandis(crop.id, state);
      const usableMandis = getUsableMandis(result?.mandis || []);

      return {
        ...crop,
        usableMandiCount: usableMandis.length,
        hasUsableData: usableMandis.length > 0,
      };
    })
  );

  return cropStatus.filter((crop) => crop.hasUsableData);
}
