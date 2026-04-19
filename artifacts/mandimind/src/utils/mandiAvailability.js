import { fetchCompare, fetchPrices } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;

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

function getRecentValidHistoryCount(priceRows, recentWindowDays = 7) {
  const today = startOfDay(new Date());

  return (priceRows ?? []).reduce((count, row) => {
    const price = row.modal_price ?? row.price;
    const parsedDate = parseArrivalDate(row.date);

    if (!Number.isFinite(price) || !parsedDate) return count;

    const freshnessDays = Math.max(
      0,
      Math.floor((today.getTime() - startOfDay(parsedDate).getTime()) / DAY_MS)
    );

    if (freshnessDays > recentWindowDays) return count;
    return count + 1;
  }, 0);
}

function classifyMandiData({ hasCurrentPrice, recentHistoryCount, minHistoryPoints = 3 }) {
  if (!hasCurrentPrice) return "unavailable";
  if (recentHistoryCount >= minHistoryPoints) return "full";
  return "limited";
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
      const todayPrice = mandiItem?.todayPrice;
      const hasCurrentPrice = Number.isFinite(todayPrice);

      if (!mandiName) return null;

      const priceResult = await fetchPrices(cropId, mandiName, state, historyDays);
      const recentHistoryCount = getRecentValidHistoryCount(priceResult?.data, recentWindowDays);

      const availability = classifyMandiData({
        hasCurrentPrice,
        recentHistoryCount,
        minHistoryPoints,
      });

      return {
        ...mandiItem,
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
