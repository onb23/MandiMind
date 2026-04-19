import { fetchCompare, fetchPrices } from "./api";
import { getCropNames } from "../data/mockPrices";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STATE = "Maharashtra";
const DEFAULT_MAX_FRESHNESS_DAYS = 3;

export function parseArrivalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [dd, mm, yyyy] = dateStr.split("/");
  if (!dd || !mm || !yyyy) return null;
  const parsed = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getFreshnessDays(parsedDate, today = startOfDay(new Date())) {
  return Math.max(0, Math.floor((today.getTime() - startOfDay(parsedDate).getTime()) / DAY_MS));
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
    return { bucket: "unavailable", isUsable: false };
  }

  const liveToday = normalizedRecords.find(
    (row) => startOfDay(row.parsedDate).getTime() === today.getTime()
  );

  if (liveToday) {
    return {
      bucket: "live_today",
      isUsable: true,
      isLiveToday: true,
      usedDate: liveToday.date,
      freshnessDays: 0,
      selectedPrice: liveToday.price,
    };
  }

  const latest = normalizedRecords[0];
  const freshnessDays = getFreshnessDays(latest.parsedDate, today);

  if (freshnessDays > maxFreshnessDays) {
    return { bucket: "unavailable", isUsable: false, freshnessDays };
  }

  return {
    bucket: "latest_available",
    isUsable: true,
    isLiveToday: false,
    usedDate: latest.date,
    freshnessDays,
    selectedPrice: latest.price,
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
        lastUpdated: mandiAvailability.usedDate ?? mandiItem.lastUpdated,
        availability,
        recentHistoryCount,
      };
    })
  );

  const usableMandis = mandiStatus
    .filter(Boolean)
    .filter((item) => item.availability !== "unavailable");

  return {
    ...compareResult,
    mandis: usableMandis,
  };
}

export async function fetchAvailableCrops(state = DEFAULT_STATE) {
  const cropList = getCropNames();
  const results = await Promise.all(
    cropList.map(async (crop) => {
      const result = await fetchAvailableMandis(crop.id, state);
      const hasUsableMandi = (result?.mandis || []).some((mandi) => mandi.isUsable);
      return hasUsableMandi ? crop : null;
    })
  );

  return results.filter(Boolean);
}
